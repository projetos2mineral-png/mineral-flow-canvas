-- Sincronização server-side resiliente: execuções, itens por projeto, trava
-- singleton com fencing token crescente e RPCs transacionais.
-- RPCs de escrita: SECURITY DEFINER, executáveis apenas por service_role.

CREATE TABLE IF NOT EXISTS public.dashboard_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_run_id uuid REFERENCES public.dashboard_sync_runs(id) ON DELETE SET NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('automatic','manual_batch','manual_single')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','completed_with_errors','abandoned','failed')),
  fencing_token bigint NOT NULL,
  locked_by text,
  created_by uuid,
  total_projects integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_sync_runs_started_idx ON public.dashboard_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_sync_runs_parent_idx ON public.dashboard_sync_runs (parent_run_id);

CREATE TABLE IF NOT EXISTS public.dashboard_sync_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.dashboard_sync_runs(id) ON DELETE CASCADE,
  runrunit_project_id bigint NOT NULL,
  project_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, runrunit_project_id)
);
CREATE INDEX IF NOT EXISTS dashboard_sync_run_items_run_status_idx ON public.dashboard_sync_run_items (run_id, status);

CREATE TABLE IF NOT EXISTS public.dashboard_sync_lock (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_locked boolean NOT NULL DEFAULT false,
  current_run_id uuid REFERENCES public.dashboard_sync_runs(id) ON DELETE SET NULL,
  lock_type text CHECK (lock_type IN ('automatic','manual_batch','manual_single')),
  locked_by text,
  fencing_token bigint NOT NULL DEFAULT 0,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dashboard_sync_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.dashboard_sync_runs, public.dashboard_sync_run_items, public.dashboard_sync_lock TO authenticated;
GRANT ALL ON public.dashboard_sync_runs, public.dashboard_sync_run_items, public.dashboard_sync_lock TO service_role;

ALTER TABLE public.dashboard_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_sync_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_sync_lock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read sync runs" ON public.dashboard_sync_runs;
CREATE POLICY "Authenticated read sync runs" ON public.dashboard_sync_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read sync items" ON public.dashboard_sync_run_items;
CREATE POLICY "Authenticated read sync items" ON public.dashboard_sync_run_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read sync lock" ON public.dashboard_sync_lock;
CREATE POLICY "Authenticated read sync lock" ON public.dashboard_sync_lock FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_max_attempts() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
CREATE OR REPLACE FUNCTION public.sync_stale_after() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '3 minutes' $$;

-- Fencing dentro da transação chamadora. FOR SHARE impede que uma
-- transferência (FOR UPDATE) aconteça antes do commit desta gravação.
CREATE OR REPLACE FUNCTION public.sync_assert_fence(p_run_id uuid, p_token bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM dashboard_sync_lock
   WHERE id = 1 AND is_locked AND current_run_id = p_run_id AND fencing_token = p_token
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOCK_LOST: execução % (token %) não é mais dona da trava', p_run_id, p_token;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_refresh_counts(p_run_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE dashboard_sync_runs r SET
    total_projects = c.total, success_count = c.ok, failed_count = c.failed_final,
    pending_count = c.total - c.ok - c.failed_final, updated_at = now()
  FROM (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'completed') AS ok,
           count(*) FILTER (WHERE status = 'failed' AND attempts >= sync_max_attempts()) AS failed_final
      FROM dashboard_sync_run_items WHERE run_id = p_run_id
  ) c
  WHERE r.id = p_run_id;
$$;

-- Recupera execução sem heartbeat: marca como abandonada (histórico mantido)
-- e cria execução filha só com itens não concluídos, herdando tentativas.
-- processing/pending -> pending; failed continua failed (esgotados ficam definitivos).
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
  IF l.heartbeat_at >= now() - sync_stale_after() THEN
    RETURN jsonb_build_object('recovered', false, 'reason', 'alive', 'run_id', l.current_run_id);
  END IF;

  SELECT * INTO old_run FROM dashboard_sync_runs WHERE id = l.current_run_id;
  UPDATE dashboard_sync_runs SET status = 'abandoned', finished_at = now(), updated_at = now(),
         error_message = 'Execução interrompida (sem heartbeat); retomada em nova execução'
   WHERE id = l.current_run_id;

  new_token := l.fencing_token + 1;
  INSERT INTO dashboard_sync_runs (parent_run_id, sync_type, fencing_token, locked_by, created_by)
  VALUES (old_run.id, COALESCE(old_run.sync_type, COALESCE(l.lock_type, 'automatic')), new_token, 'watchdog', old_run.created_by)
  RETURNING id INTO new_id;

  INSERT INTO dashboard_sync_run_items (run_id, runrunit_project_id, project_name, status, attempts, next_attempt_at, error_message)
  SELECT new_id, i.runrunit_project_id, i.project_name,
         CASE WHEN i.status = 'failed' THEN 'failed' ELSE 'pending' END,
         i.attempts, now(), i.error_message
    FROM dashboard_sync_run_items i
   WHERE i.run_id = old_run.id AND i.status <> 'completed';

  UPDATE dashboard_sync_lock SET current_run_id = new_id, fencing_token = new_token,
         locked_by = 'watchdog', heartbeat_at = now(), updated_at = now()
   WHERE id = 1;
  PERFORM sync_refresh_counts(new_id);
  RETURN jsonb_build_object('recovered', true, 'run_id', new_id, 'fencing_token', new_token, 'parent_run_id', old_run.id);
END $$;

-- Aquisição atômica da trava + execução + itens.
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
  IF p_sync_type = 'manual_single' AND cardinality(p_project_ids) <> 1 THEN
    RAISE EXCEPTION 'manual_single aceita exatamente um projeto';
  END IF;

  SELECT * INTO l FROM dashboard_sync_lock WHERE id = 1 FOR UPDATE;
  IF l.is_locked THEN
    IF l.heartbeat_at < now() - sync_stale_after() THEN
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
         locked_by = p_locked_by, fencing_token = new_token, locked_at = now(), heartbeat_at = now(), updated_at = now()
   WHERE id = 1;
  PERFORM sync_refresh_counts(new_id);
  RETURN jsonb_build_object('acquired', true, 'run_id', new_id, 'fencing_token', new_token);
END $$;

CREATE OR REPLACE FUNCTION public.sync_heartbeat(p_run_id uuid, p_token bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  UPDATE dashboard_sync_lock SET heartbeat_at = now() WHERE id = 1 AND current_run_id = p_run_id AND fencing_token = p_token;
  UPDATE dashboard_sync_runs SET heartbeat_at = now() WHERE id = p_run_id;
END $$;

-- Reserva atômica de um item: SKIP LOCKED evita dois workers no mesmo projeto.
CREATE OR REPLACE FUNCTION public.sync_claim_next(p_run_id uuid, p_token bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it dashboard_sync_run_items%ROWTYPE;
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  -- Reserva expirada (worker morreu no meio): conta como tentativa falhada.
  UPDATE dashboard_sync_run_items SET status = 'failed', claim_id = NULL, next_attempt_at = now(),
         error_message = 'Processamento interrompido (reserva expirada)', completed_at = now(), updated_at = now()
   WHERE run_id = p_run_id AND status = 'processing' AND started_at < now() - interval '5 minutes';
  SELECT * INTO it FROM dashboard_sync_run_items
   WHERE run_id = p_run_id
     AND (status = 'pending' OR (status = 'failed' AND attempts < sync_max_attempts()))
     AND next_attempt_at <= now()
   ORDER BY attempts, created_at, id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE dashboard_sync_run_items SET status = 'processing', attempts = attempts + 1,
         claim_id = gen_random_uuid(), started_at = now(), updated_at = now()
   WHERE id = it.id RETURNING * INTO it;
  UPDATE dashboard_sync_lock SET heartbeat_at = now() WHERE id = 1 AND current_run_id = p_run_id;
  RETURN jsonb_build_object('item_id', it.id, 'claim_id', it.claim_id, 'runrunit_project_id', it.runrunit_project_id,
                            'project_name', it.project_name, 'attempts', it.attempts);
END $$;

-- Igual a monthlyLaneTitle() do app.
CREATE OR REPLACE FUNCTION public.sync_month_title(d date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])
         [extract(month FROM d)::int] || '/' || extract(year FROM d)::int
$$;

-- Mesma regra de decideCardAllocation(): não toca em card numa fila válida
-- do próprio quadro nem em card posicionado manualmente (inclui "Sem fila").
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

-- Persistência atômica de UM projeto: fencing + projeto + tarefas + pessoas
-- + alocação na mesma transação. Qualquer erro desfaz tudo.
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

    UPDATE runrunit_projects SET is_tracking_enabled = true, is_new_candidate = false,
           last_people_synced_at = now(), last_synced_at = now()
     WHERE runrunit_project_id = pid;

    allocated := sync_allocate_project_cards(pid);
  END IF;

  UPDATE dashboard_sync_lock SET heartbeat_at = now() WHERE id = 1 AND current_run_id = p_run_id;
  RETURN jsonb_build_object('is_open', is_open_v, 'cards_allocated', allocated);
END $$;

CREATE OR REPLACE FUNCTION public.sync_complete_item(p_run_id uuid, p_token bigint, p_item_id uuid, p_claim_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  UPDATE dashboard_sync_run_items SET status = 'completed', claim_id = NULL, error_message = NULL, completed_at = now(), updated_at = now()
   WHERE id = p_item_id AND run_id = p_run_id AND status = 'processing' AND claim_id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_LOST: item %', p_item_id; END IF;
  PERFORM sync_refresh_counts(p_run_id);
END $$;

-- Falha registrada em transação SEPARADA da persistência desfeita.
-- Backoff: 30s após a 1ª falha, 120s após a 2ª; na 3ª é definitiva.
CREATE OR REPLACE FUNCTION public.sync_record_failure(p_run_id uuid, p_token bigint, p_item_id uuid, p_claim_id uuid, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it dashboard_sync_run_items%ROWTYPE;
BEGIN
  PERFORM sync_assert_fence(p_run_id, p_token);
  UPDATE dashboard_sync_run_items SET status = 'failed', claim_id = NULL, error_message = left(p_error, 2000), completed_at = now(),
         next_attempt_at = now() + CASE WHEN attempts <= 1 THEN interval '30 seconds' ELSE interval '120 seconds' END,
         updated_at = now()
   WHERE id = p_item_id AND run_id = p_run_id AND status = 'processing' AND claim_id = p_claim_id
  RETURNING * INTO it;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_LOST: item %', p_item_id; END IF;
  PERFORM sync_refresh_counts(p_run_id);
  RETURN jsonb_build_object('attempts', it.attempts, 'definitive', it.attempts >= sync_max_attempts());
END $$;

CREATE OR REPLACE FUNCTION public.sync_finalize(p_run_id uuid, p_token bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE busy int; waiting timestamptz; failed_final int; st text;
BEGIN
  PERFORM 1 FROM dashboard_sync_lock
   WHERE id = 1 AND is_locked AND current_run_id = p_run_id AND fencing_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOCK_LOST: execução % não é mais dona da trava', p_run_id; END IF;

  SELECT count(*) FILTER (WHERE status IN ('pending','processing')),
         min(next_attempt_at) FILTER (WHERE status = 'failed' AND attempts < sync_max_attempts()),
         count(*) FILTER (WHERE status = 'failed' AND attempts >= sync_max_attempts())
    INTO busy, waiting, failed_final
    FROM dashboard_sync_run_items WHERE run_id = p_run_id;
  IF busy > 0 OR waiting IS NOT NULL THEN
    RETURN jsonb_build_object('done', false, 'busy', busy,
      'wait_seconds', GREATEST(0, COALESCE(extract(epoch FROM waiting - now()), 0))::int);
  END IF;

  st := CASE WHEN failed_final > 0 THEN 'completed_with_errors' ELSE 'completed' END;
  PERFORM sync_refresh_counts(p_run_id);
  UPDATE dashboard_sync_runs SET status = st, finished_at = now(), updated_at = now() WHERE id = p_run_id;
  UPDATE dashboard_sync_lock SET is_locked = false, current_run_id = NULL, lock_type = NULL, locked_by = NULL,
         locked_at = NULL, heartbeat_at = NULL, updated_at = now()
   WHERE id = 1 AND current_run_id = p_run_id AND fencing_token = p_token;
  RETURN jsonb_build_object('done', true, 'status', st);
END $$;

CREATE OR REPLACE FUNCTION public.sync_fail_run(p_run_id uuid, p_token bigint, p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM dashboard_sync_lock
   WHERE id = 1 AND is_locked AND current_run_id = p_run_id AND fencing_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM sync_refresh_counts(p_run_id);
  UPDATE dashboard_sync_runs SET status = 'failed', error_message = left(p_error, 2000), finished_at = now(), updated_at = now()
   WHERE id = p_run_id;
  UPDATE dashboard_sync_lock SET is_locked = false, current_run_id = NULL, lock_type = NULL, locked_by = NULL,
         locked_at = NULL, heartbeat_at = NULL, updated_at = now()
   WHERE id = 1 AND current_run_id = p_run_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_current_run()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN is_locked THEN jsonb_build_object('run_id', current_run_id, 'fencing_token', fencing_token,
         'heartbeat_age_seconds', extract(epoch FROM now() - heartbeat_at)::int,
         'stale', heartbeat_at < now() - sync_stale_after()) END
    FROM dashboard_sync_lock WHERE id = 1
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'sync_assert_fence(uuid,bigint)','sync_refresh_counts(uuid)','sync_recover_stale()',
    'sync_acquire_lock(text,text,bigint[],uuid)','sync_heartbeat(uuid,bigint)','sync_claim_next(uuid,bigint)',
    'sync_allocate_project_cards(bigint)','sync_persist_project(uuid,bigint,uuid,uuid,jsonb,jsonb,jsonb)',
    'sync_complete_item(uuid,bigint,uuid,uuid)','sync_record_failure(uuid,bigint,uuid,uuid,text)',
    'sync_finalize(uuid,bigint)','sync_fail_run(uuid,bigint,text)','sync_current_run()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
