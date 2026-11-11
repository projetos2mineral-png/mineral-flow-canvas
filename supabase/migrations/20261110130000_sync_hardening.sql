-- Endurecimento da sincronização resiliente: tentativas, recuperação,
-- alocação a partir da view, remoção de tarefas órfãs e contagem de espera.

CREATE OR REPLACE FUNCTION public.sync_recover_stale()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l dashboard_sync_lock%ROWTYPE;
  old_run dashboard_sync_runs%ROWTYPE;
  new_id uuid;
  new_token bigint;
BEGIN
  SELECT * INTO l FROM dashboard_sync_lock WHERE id = 1 FOR UPDATE;
  IF NOT l.is_locked THEN RETURN jsonb_build_object('recovered', false, 'reason', 'idle'); END IF;
  SELECT * INTO old_run FROM dashboard_sync_runs WHERE id = l.current_run_id;
  IF old_run.heartbeat_at >= now() - sync_stale_after() THEN
    RETURN jsonb_build_object('recovered', false, 'reason', 'alive', 'run_id', l.current_run_id);
  END IF;

  UPDATE dashboard_sync_runs SET status = 'abandoned', finished_at = now(), updated_at = now(),
         error_message = 'Execução interrompida (sem heartbeat); retomada em nova execução'
   WHERE id = l.current_run_id;

  new_token := l.fencing_token + 1;
  INSERT INTO dashboard_sync_runs (parent_run_id, sync_type, fencing_token, locked_by, created_by)
  VALUES (old_run.id, COALESCE(old_run.sync_type, COALESCE(l.lock_type, 'automatic')), new_token, 'watchdog', old_run.created_by)
  RETURNING id INTO new_id;

  -- Itens que já esgotaram as tentativas não podem ganhar uma 4ª chance.
  INSERT INTO dashboard_sync_run_items (run_id, runrunit_project_id, project_name, status, attempts, next_attempt_at, error_message)
  SELECT new_id, i.runrunit_project_id, i.project_name,
         CASE
           WHEN i.status = 'failed' OR i.attempts >= sync_max_attempts() THEN 'failed'
           ELSE 'pending'
         END,
         i.attempts, now(), i.error_message
    FROM dashboard_sync_run_items i
   WHERE i.run_id = old_run.id AND i.status <> 'completed';

  UPDATE dashboard_sync_lock SET current_run_id = new_id, fencing_token = new_token,
         locked_by = 'watchdog', updated_at = now()
   WHERE id = 1;
  PERFORM sync_refresh_counts(new_id);
  RETURN jsonb_build_object('recovered', true, 'run_id', new_id, 'fencing_token', new_token, 'parent_run_id', old_run.id);
END $$;

CREATE OR REPLACE FUNCTION public.sync_acquire_lock(
  p_sync_type text, p_locked_by text, p_project_ids bigint[] DEFAULT NULL, p_created_by uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l dashboard_sync_lock%ROWTYPE;
  new_id uuid;
  new_token bigint;
  rec jsonb;
BEGIN
  IF p_sync_type NOT IN ('automatic','manual_batch','manual_single') THEN
    RAISE EXCEPTION 'sync_type inválido: %', p_sync_type;
  END IF;
  IF p_sync_type <> 'automatic' AND (p_project_ids IS NULL OR cardinality(p_project_ids) = 0) THEN
    RAISE EXCEPTION 'Informe ao menos um projeto';
  END IF;
  IF p_sync_type = 'manual_single' AND (p_project_ids IS NULL OR cardinality(p_project_ids) <> 1) THEN
    RAISE EXCEPTION 'manual_single aceita exatamente um projeto';
  END IF;

  SELECT * INTO l FROM dashboard_sync_lock WHERE id = 1 FOR UPDATE;
  IF l.is_locked THEN
    IF l.current_run_id IS NULL
       OR (SELECT heartbeat_at FROM dashboard_sync_runs WHERE id = l.current_run_id) < now() - sync_stale_after() THEN
      rec := sync_recover_stale();
      RETURN jsonb_build_object('acquired', false, 'reason', 'recovering', 'run_id', rec->>'run_id',
        'message', 'Uma sincronização interrompida está sendo retomada. Aguarde o término.');
    END IF;
    RETURN jsonb_build_object('acquired', false, 'reason', 'busy', 'run_id', l.current_run_id,
      'lock_type', l.lock_type, 'locked_by', l.locked_by, 'locked_at', l.locked_at,
      'message', 'Já existe uma sincronização em andamento. Aguarde o término.');
  END IF;

  new_token := l.fencing_token + 1;
  INSERT INTO dashboard_sync_runs (sync_type, fencing_token, locked_by, created_by)
  VALUES (p_sync_type, new_token, p_locked_by, p_created_by) RETURNING id INTO new_id;

  IF p_sync_type = 'automatic' THEN
    INSERT INTO dashboard_sync_run_items (run_id, runrunit_project_id, project_name)
    SELECT new_id, p.runrunit_project_id, p.name FROM runrunit_projects p
     WHERE p.is_tracking_enabled = true AND p.is_open = true AND p.desired_delivery_date IS NOT NULL;
  ELSE
    INSERT INTO dashboard_sync_run_items (run_id, runrunit_project_id, project_name)
    SELECT DISTINCT ON (x.id) new_id, x.id, p.name
      FROM unnest(p_project_ids) AS x(id) LEFT JOIN runrunit_projects p ON p.runrunit_project_id = x.id;
  END IF;

  UPDATE dashboard_sync_lock SET is_locked = true, current_run_id = new_id, lock_type = p_sync_type,
         locked_by = p_locked_by, fencing_token = new_token, locked_at = now(), updated_at = now()
   WHERE id = 1;
  PERFORM sync_refresh_counts(new_id);
  RETURN jsonb_build_object('acquired', true, 'run_id', new_id, 'fencing_token', new_token);
END $$;

CREATE OR REPLACE FUNCTION public.sync_refresh_counts(p_run_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE dashboard_sync_runs r SET
    total_projects = c.total, success_count = c.ok, failed_count = c.failed_final,
    pending_count = c.total - c.ok - c.failed_final, updated_at = now()
  FROM (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'completed') AS ok,
           count(*) FILTER (WHERE (status = 'failed' OR status = 'pending') AND attempts >= sync_max_attempts()) AS failed_final
      FROM dashboard_sync_run_items WHERE run_id = p_run_id
  ) c
  WHERE r.id = p_run_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_claim_next(p_run_id uuid, p_token bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it dashboard_sync_run_items%ROWTYPE;
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  UPDATE dashboard_sync_run_items SET status = 'failed', claim_id = NULL, next_attempt_at = now(),
         error_message = 'Processamento interrompido (reserva expirada)', completed_at = now(), updated_at = now()
   WHERE run_id = p_run_id AND status = 'processing' AND started_at < now() - interval '5 minutes';
  SELECT * INTO it FROM dashboard_sync_run_items
   WHERE run_id = p_run_id
     AND ((status = 'pending' AND attempts < sync_max_attempts())
          OR (status = 'failed' AND attempts < sync_max_attempts()))
     AND next_attempt_at <= now()
   ORDER BY attempts, created_at, runrunit_project_id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE dashboard_sync_run_items SET status = 'processing', attempts = attempts + 1,
         claim_id = gen_random_uuid(), started_at = now(), updated_at = now()
   WHERE id = it.id RETURNING * INTO it;
  UPDATE dashboard_sync_runs SET heartbeat_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('item_id', it.id, 'claim_id', it.claim_id, 'runrunit_project_id', it.runrunit_project_id,
                            'project_name', it.project_name, 'attempts', it.attempts);
END $$;

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
      UNION ALL SELECT assignee_name FROM v_dashboard_projects WHERE runrunit_project_id = p_project_id
      -- Fallback quando runrunit_project_people (e portanto a view, que faz
      -- JOIN nela) está vazia: usa os responsáveis já gravados nas tarefas.
      UNION ALL SELECT responsible_name FROM runrunit_tasks WHERE runrunit_project_id = p_project_id
      UNION ALL
      SELECT a->>'assignee_name'
        FROM runrunit_tasks t
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.raw_data->'assignments') = 'array'
               THEN t.raw_data->'assignments' ELSE '[]'::jsonb END
        ) a
       WHERE t.runrunit_project_id = p_project_id
    ) s WHERE nullif(btrim(assignee_name), '') IS NOT NULL
  LOOP
    SELECT COALESCE(max(antecedence_days), 0) INTO ante FROM dashboard_board_settings WHERE assignee_name = who;
    target := NULL;
    SELECT id INTO target FROM dashboard_lanes
     WHERE assignee_name = who AND lower(btrim(title)) = lower(sync_month_title(desired - GREATEST(ante,0)))
     ORDER BY created_at NULLS LAST, id LIMIT 1;
    SELECT id, lane_id, manually_positioned INTO c FROM dashboard_project_cards
     WHERE runrunit_project_id = p_project_id AND assignee_name = who LIMIT 1;
    IF FOUND THEN
      valid := c.lane_id IS NOT NULL AND EXISTS (SELECT 1 FROM dashboard_lanes WHERE id = c.lane_id AND assignee_name = who);
      CONTINUE WHEN valid;
      CONTINUE WHEN c.manually_positioned IS TRUE;
      CONTINUE WHEN target IS NULL;
      UPDATE dashboard_project_cards SET lane_id = target, manually_positioned = false, updated_at = now()
       WHERE id = c.id AND lane_id IS NOT DISTINCT FROM c.lane_id AND manually_positioned IS NOT TRUE;
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
      status, is_open, is_tracking_enabled, raw_data, desired_delivery_date, created_at_runrunit, updated_at_runrunit, last_synced_at, last_project_detail_synced_at)
  VALUES (pid, p_project->>'name', p_project->>'client_name', p_project->>'project_group_name', p_project->>'project_sub_group_name',
      p_project->>'status', is_open_v, true, p_project->'raw_data', (p_project->>'desired_delivery_date')::date,
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

    -- Tarefas que sumiram do Runrun.it não podem continuar no dashboard.
    DELETE FROM runrunit_tasks t
     WHERE t.runrunit_project_id = pid
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(p_tasks, '[]'::jsonb)) x
          WHERE (x->>'runrunit_task_id')::bigint = t.runrunit_task_id
       );

    DELETE FROM runrunit_project_people WHERE runrunit_project_id = pid;
    INSERT INTO runrunit_project_people (runrunit_project_id, assignee_id, assignee_name, team_id, team_name, source, last_synced_at)
    SELECT pid, x->>'assignee_id', x->>'assignee_name', (x->>'team_id')::bigint, x->>'team_name', 'task_assignment', now()
      FROM jsonb_array_elements(COALESCE(p_people, '[]'::jsonb)) x;

    -- Preserva a escolha do usuário: sincronizar não reativa tracking desligado.
    UPDATE runrunit_projects SET is_new_candidate = false,
           last_people_synced_at = now(), last_synced_at = now()
     WHERE runrunit_project_id = pid;

    allocated := sync_allocate_project_cards(pid);
  END IF;

  UPDATE dashboard_sync_runs SET heartbeat_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('is_open', is_open_v, 'cards_allocated', allocated);
END $$;

-- Substituição atômica das estimativas de um escopo. O fencing é revalidado
-- dentro da transação; se o token foi perdido, o DELETE/INSERT é desfeito.
CREATE OR REPLACE FUNCTION public.sync_replace_project_estimates(
  p_run_id uuid, p_token bigint, p_project_ids bigint[], p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted int := 0;
BEGIN
  IF p_project_ids IS NULL OR cardinality(p_project_ids) = 0 THEN
    RAISE EXCEPTION 'Escopo de estimativas vazio';
  END IF;
  PERFORM sync_assert_fence(p_run_id, p_token);

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) r
     WHERE (r->>'runrunit_project_id') IS NULL
        OR NOT ((r->>'runrunit_project_id')::bigint = ANY(p_project_ids))
  ) THEN
    RAISE EXCEPTION 'Estimativa fora do escopo da execução';
  END IF;

  DELETE FROM dashboard_project_estimates WHERE runrunit_project_id = ANY(p_project_ids);
  INSERT INTO dashboard_project_estimates
    (runrunit_project_id, assignee_name, total_tasks, total_estimated_hours, calculation_details, updated_at)
  SELECT x.runrunit_project_id, x.assignee_name, x.total_tasks, x.total_estimated_hours,
         x.calculation_details, COALESCE(x.updated_at, now())
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
      runrunit_project_id bigint, assignee_name text, total_tasks integer,
      total_estimated_hours numeric, calculation_details jsonb, updated_at timestamptz);
  GET DIAGNOSTICS inserted = ROW_COUNT;

  UPDATE dashboard_sync_runs SET heartbeat_at = now() WHERE id = p_run_id;
  RETURN inserted;
END $$;

-- Não libera a trava enquanto existir item em processamento: outro worker
-- pode estar no meio de uma gravação. O watchdog retoma quando o heartbeat
-- vencer; a execução só é encerrada quando não há mais trabalho ativo.
CREATE OR REPLACE FUNCTION public.sync_fail_run(p_run_id uuid, p_token bigint, p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM dashboard_sync_lock
   WHERE id = 1 AND is_locked AND current_run_id = p_run_id AND fencing_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM dashboard_sync_run_items
     WHERE run_id = p_run_id AND status = 'processing'
  ) THEN
    UPDATE dashboard_sync_runs
       SET error_message = left(p_error, 2000), updated_at = now()
     WHERE id = p_run_id;
    RETURN;
  END IF;

  PERFORM sync_refresh_counts(p_run_id);
  UPDATE dashboard_sync_runs SET status = 'failed', error_message = left(p_error, 2000),
         finished_at = now(), updated_at = now()
   WHERE id = p_run_id;
  UPDATE dashboard_sync_lock SET is_locked = false, current_run_id = NULL, lock_type = NULL, locked_by = NULL,
         locked_at = NULL, updated_at = now()
   WHERE id = 1 AND current_run_id = p_run_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_finalize(p_run_id uuid, p_token bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pending int; processing int; waiting int; next_wait timestamptz; failed_final int; st text;
BEGIN
  PERFORM 1 FROM dashboard_sync_lock
   WHERE id = 1 AND is_locked AND current_run_id = p_run_id AND fencing_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOCK_LOST: execução % não é mais dona da trava', p_run_id; END IF;

  SELECT count(*) FILTER (WHERE status = 'pending' AND attempts < sync_max_attempts()),
         count(*) FILTER (WHERE status = 'processing'),
         count(*) FILTER (WHERE status = 'failed' AND attempts < sync_max_attempts()),
         min(next_attempt_at) FILTER (WHERE status = 'failed' AND attempts < sync_max_attempts()),
         count(*) FILTER (WHERE (status = 'failed' OR status = 'pending') AND attempts >= sync_max_attempts())
    INTO pending, processing, waiting, next_wait, failed_final
    FROM dashboard_sync_run_items WHERE run_id = p_run_id;

  IF pending > 0 OR processing > 0 OR waiting > 0 THEN
    RETURN jsonb_build_object('done', false, 'busy', pending + processing,
      'pending', pending, 'processing', processing, 'waiting', waiting,
      'wait_seconds', GREATEST(0, COALESCE(extract(epoch FROM next_wait - now()), 0))::int);
  END IF;

  st := CASE WHEN failed_final > 0 THEN 'completed_with_errors' ELSE 'completed' END;
  PERFORM sync_refresh_counts(p_run_id);
  UPDATE dashboard_sync_runs SET status = st, finished_at = now(), updated_at = now() WHERE id = p_run_id;
  UPDATE dashboard_sync_lock SET is_locked = false, current_run_id = NULL, lock_type = NULL, locked_by = NULL,
         locked_at = NULL, updated_at = now()
   WHERE id = 1 AND current_run_id = p_run_id AND fencing_token = p_token;
  RETURN jsonb_build_object('done', true, 'status', st);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'sync_recover_stale()','sync_acquire_lock(text,text,bigint[],uuid)','sync_refresh_counts(uuid)','sync_claim_next(uuid,bigint)',
    'sync_allocate_project_cards(bigint)','sync_persist_project(uuid,bigint,uuid,uuid,jsonb,jsonb,jsonb)',
    'sync_replace_project_estimates(uuid,bigint,bigint[],jsonb)','sync_fail_run(uuid,bigint,text)','sync_finalize(uuid,bigint)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
