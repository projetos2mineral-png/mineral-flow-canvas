ALTER TABLE public.dashboard_project_cards
  ADD COLUMN IF NOT EXISTS manually_positioned_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_allocate_project_cards(p_project_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  desired date; open_v boolean; who text; ante int; target uuid; c record; n int := 0; valid boolean;
BEGIN
  SELECT desired_delivery_date, is_open INTO desired, open_v FROM runrunit_projects WHERE runrunit_project_id = p_project_id;
  IF desired IS NULL OR open_v IS NOT TRUE THEN RETURN 0; END IF;
  FOR who IN
    SELECT DISTINCT btrim(assignee_name) FROM (
      SELECT assignee_name FROM runrunit_project_people WHERE runrunit_project_id = p_project_id
      UNION ALL SELECT assignee_name FROM dashboard_project_cards WHERE runrunit_project_id = p_project_id
    ) s WHERE nullif(btrim(assignee_name), '') IS NOT NULL
  LOOP
    SELECT COALESCE(max(antecedence_days), 0) INTO ante FROM dashboard_board_settings WHERE assignee_name = who;
    target := NULL;
    SELECT id INTO target FROM dashboard_lanes
     WHERE assignee_name = who AND lower(btrim(title)) = lower(sync_month_title(desired - GREATEST(ante,0)))
     ORDER BY created_at NULLS LAST, id LIMIT 1;
    SELECT id, lane_id, manually_positioned, manually_positioned_at INTO c FROM dashboard_project_cards
     WHERE runrunit_project_id = p_project_id AND assignee_name = who LIMIT 1;
    IF FOUND THEN
      valid := c.lane_id IS NOT NULL AND EXISTS (SELECT 1 FROM dashboard_lanes WHERE id = c.lane_id AND assignee_name = who);
      CONTINUE WHEN valid;
      CONTINUE WHEN c.manually_positioned IS TRUE OR c.manually_positioned_at IS NOT NULL;
      CONTINUE WHEN target IS NULL;
      UPDATE dashboard_project_cards SET lane_id = target, manually_positioned = false, updated_at = now()
       WHERE id = c.id AND lane_id IS NOT DISTINCT FROM c.lane_id
         AND manually_positioned IS NOT TRUE AND manually_positioned_at IS NULL;
      n := n + 1;
    ELSIF target IS NOT NULL THEN
      INSERT INTO dashboard_project_cards (runrunit_project_id, assignee_name, lane_id, status, position, review_status, manually_positioned)
      VALUES (p_project_id, who, target, 'a iniciar', 0, 'não enviado', false);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.sync_persist_project(
  p_run_id uuid, p_token bigint, p_item_id uuid, p_claim_id uuid, p_project jsonb, p_tasks jsonb, p_people jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid bigint; is_open_v boolean; allocated int := 0;
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  PERFORM 1 FROM dashboard_sync_run_items
   WHERE id = p_item_id AND run_id = p_run_id AND status = 'processing' AND claim_id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_LOST: item % não está mais reservado para este worker', p_item_id; END IF;

  pid := (p_project->>'runrunit_project_id')::bigint;
  is_open_v := COALESCE((p_project->>'is_open')::boolean, true);

  INSERT INTO runrunit_projects (runrunit_project_id, name, client_name, project_group_name, project_sub_group_name,
      status, is_open, raw_data, desired_delivery_date, created_at_runrunit, updated_at_runrunit, last_synced_at, last_project_detail_synced_at)
  VALUES (pid, p_project->>'name', p_project->>'client_name', p_project->>'project_group_name', p_project->>'project_sub_group_name',
      p_project->>'status', is_open_v, p_project->'raw_data', (p_project->>'desired_delivery_date')::date,
      (p_project->>'created_at_runrunit')::timestamptz, (p_project->>'updated_at_runrunit')::timestamptz, now(), now())
  ON CONFLICT (runrunit_project_id) DO UPDATE SET
      name = EXCLUDED.name, client_name = EXCLUDED.client_name, project_group_name = EXCLUDED.project_group_name,
      project_sub_group_name = EXCLUDED.project_sub_group_name, status = EXCLUDED.status, is_open = EXCLUDED.is_open,
      raw_data = EXCLUDED.raw_data, desired_delivery_date = EXCLUDED.desired_delivery_date,
      created_at_runrunit = EXCLUDED.created_at_runrunit, updated_at_runrunit = EXCLUDED.updated_at_runrunit,
      last_synced_at = now(), last_project_detail_synced_at = now();

  IF NOT is_open_v THEN
    UPDATE runrunit_projects SET is_tracking_enabled = false, is_new_candidate = false WHERE runrunit_project_id = pid;
    DELETE FROM dashboard_project_estimates WHERE runrunit_project_id = pid;
  ELSE
    INSERT INTO runrunit_tasks (runrunit_task_id, runrunit_project_id, title, responsible_name, team_name, task_type,
        status, board_stage_name, desired_date, close_date, raw_data, last_synced_at)
    SELECT (t->>'runrunit_task_id')::bigint, pid, COALESCE(t->>'title','Sem título'), t->>'responsible_name', t->>'team_name',
        t->>'task_type', t->>'status', t->>'board_stage_name', (t->>'desired_date')::timestamptz, (t->>'close_date')::timestamptz,
        t->'raw_data', now()
      FROM jsonb_array_elements(COALESCE(p_tasks, '[]'::jsonb)) t
    ON CONFLICT (runrunit_task_id) DO UPDATE SET
        runrunit_project_id = EXCLUDED.runrunit_project_id, title = EXCLUDED.title, responsible_name = EXCLUDED.responsible_name,
        team_name = EXCLUDED.team_name, task_type = EXCLUDED.task_type, status = EXCLUDED.status,
        board_stage_name = EXCLUDED.board_stage_name, desired_date = EXCLUDED.desired_date, close_date = EXCLUDED.close_date,
        raw_data = EXCLUDED.raw_data, last_synced_at = now();

    DELETE FROM runrunit_project_people WHERE runrunit_project_id = pid;
    INSERT INTO runrunit_project_people (runrunit_project_id, assignee_id, assignee_name, team_id, team_name, source, last_synced_at)
    SELECT pid, x->>'assignee_id', x->>'assignee_name', (x->>'team_id')::bigint, x->>'team_name', 'task_assignment', now()
      FROM jsonb_array_elements(COALESCE(p_people, '[]'::jsonb)) x;

    UPDATE runrunit_projects SET is_new_candidate = false,
           last_people_synced_at = now(), last_synced_at = now()
     WHERE runrunit_project_id = pid;

    allocated := sync_allocate_project_cards(pid);
  END IF;

  UPDATE dashboard_sync_runs SET heartbeat_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('is_open', is_open_v, 'cards_allocated', allocated);
END $$;
