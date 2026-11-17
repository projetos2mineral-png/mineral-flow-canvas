-- Horas trabalhadas importadas do Runrun.it.
-- Nada aqui altera/substitui dashboard_user_capacity: capacidade mensal,
-- horas planejadas e horas trabalhadas são informações independentes.
--
-- Leitura: qualquer usuário autenticado (mesmo modelo das demais tabelas dashboard_*).
-- Escrita das horas importadas: apenas service_role (rotina server-side).
-- Mapeamento: leitura autenticada; manutenção por administradores.

-- 1) Vínculo entre o nome exibido na Central e o ID oficial do Runrun.it.
CREATE TABLE IF NOT EXISTS public.dashboard_user_runrunit_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  runrunit_user_id text NOT NULL,
  runrunit_user_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_user_runrunit_mapping_user_name_key
  ON public.dashboard_user_runrunit_mapping (user_name);
CREATE INDEX IF NOT EXISTS dashboard_user_runrunit_mapping_runrunit_idx
  ON public.dashboard_user_runrunit_mapping (runrunit_user_id);

-- 2) Cada importação executada (período consultado, início, término e resultado).
CREATE TABLE IF NOT EXISTS public.dashboard_worked_hours_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'runrunit',
  trigger_source text NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual','scheduled')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','completed_with_warnings','failed')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_received integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  rows_changed integer NOT NULL DEFAULT 0,
  rows_without_user integer NOT NULL DEFAULT 0,
  rows_without_mapping integer NOT NULL DEFAULT 0,
  result_summary jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_worked_hours_imports_started_idx
  ON public.dashboard_worked_hours_imports (started_at DESC);
-- Impede duas importações simultâneas. Execuções presas são liberadas pelo serviço
-- antes de iniciar uma nova (ver import.server.ts).
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_worked_hours_imports_running_key
  ON public.dashboard_worked_hours_imports (status) WHERE status = 'running';

-- 3) Horas por usuário e dia, sempre em segundos (preserva a precisão original).
CREATE TABLE IF NOT EXISTS public.dashboard_user_daily_worked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  runrunit_user_id text NOT NULL,
  runrunit_user_name text,
  work_date date NOT NULL,
  manual_seconds bigint NOT NULL DEFAULT 0 CHECK (manual_seconds >= 0),
  automatic_seconds bigint NOT NULL DEFAULT 0 CHECK (automatic_seconds >= 0),
  total_seconds bigint NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
  import_id uuid REFERENCES public.dashboard_worked_hours_imports(id) ON DELETE SET NULL,
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_name, work_date)
);
CREATE INDEX IF NOT EXISTS dashboard_user_daily_worked_date_idx
  ON public.dashboard_user_daily_worked (work_date);
CREATE INDEX IF NOT EXISTS dashboard_user_daily_worked_user_idx
  ON public.dashboard_user_daily_worked (user_name);

-- 4) Diferenças detectadas entre importações (valor anterior e novo).
-- Não registra autoria nem motivo: a importação apenas compara valores.
CREATE TABLE IF NOT EXISTS public.dashboard_worked_hours_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.dashboard_worked_hours_imports(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  runrunit_user_id text NOT NULL,
  work_date date NOT NULL,
  previous_manual_seconds bigint,
  new_manual_seconds bigint NOT NULL,
  previous_automatic_seconds bigint,
  new_automatic_seconds bigint NOT NULL,
  previous_total_seconds bigint,
  new_total_seconds bigint NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_worked_hours_history_date_idx
  ON public.dashboard_worked_hours_history (work_date DESC);
CREATE INDEX IF NOT EXISTS dashboard_worked_hours_history_user_idx
  ON public.dashboard_worked_hours_history (user_name);

GRANT SELECT ON public.dashboard_user_runrunit_mapping TO authenticated;
GRANT SELECT ON public.dashboard_worked_hours_imports TO authenticated;
GRANT SELECT ON public.dashboard_user_daily_worked TO authenticated;
GRANT SELECT ON public.dashboard_worked_hours_history TO authenticated;

GRANT ALL ON public.dashboard_user_runrunit_mapping TO service_role;
GRANT ALL ON public.dashboard_worked_hours_imports TO service_role;
GRANT ALL ON public.dashboard_user_daily_worked TO service_role;
GRANT ALL ON public.dashboard_worked_hours_history TO service_role;

ALTER TABLE public.dashboard_user_runrunit_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_worked_hours_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_user_daily_worked ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_worked_hours_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read worked hours mapping" ON public.dashboard_user_runrunit_mapping;
CREATE POLICY "Authenticated read worked hours mapping"
  ON public.dashboard_user_runrunit_mapping FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins insert worked hours mapping" ON public.dashboard_user_runrunit_mapping;
CREATE POLICY "Admins insert worked hours mapping"
  ON public.dashboard_user_runrunit_mapping FOR INSERT TO authenticated
  WITH CHECK (public.current_access_level() = 'administrador');

DROP POLICY IF EXISTS "Admins update worked hours mapping" ON public.dashboard_user_runrunit_mapping;
CREATE POLICY "Admins update worked hours mapping"
  ON public.dashboard_user_runrunit_mapping FOR UPDATE TO authenticated
  USING (public.current_access_level() = 'administrador')
  WITH CHECK (public.current_access_level() = 'administrador');

DROP POLICY IF EXISTS "Admins delete worked hours mapping" ON public.dashboard_user_runrunit_mapping;
CREATE POLICY "Admins delete worked hours mapping"
  ON public.dashboard_user_runrunit_mapping FOR DELETE TO authenticated
  USING (public.current_access_level() = 'administrador');

DROP POLICY IF EXISTS "Authenticated read worked hours imports" ON public.dashboard_worked_hours_imports;
CREATE POLICY "Authenticated read worked hours imports"
  ON public.dashboard_worked_hours_imports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated read daily worked hours" ON public.dashboard_user_daily_worked;
CREATE POLICY "Authenticated read daily worked hours"
  ON public.dashboard_user_daily_worked FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated read worked hours history" ON public.dashboard_worked_hours_history;
CREATE POLICY "Authenticated read worked hours history"
  ON public.dashboard_worked_hours_history FOR SELECT TO authenticated USING (true);

-- 5) Aplicação transacional: compara com o valor anterior, grava histórico
-- somente quando houve diferença e faz upsert por (user_name, work_date).
CREATE OR REPLACE FUNCTION public.dashboard_apply_worked_hours(p_import_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  prev public.dashboard_user_daily_worked%ROWTYPE;
  v_user_name text;
  v_runrunit_user_id text;
  v_runrunit_user_name text;
  v_work_date date;
  v_manual bigint;
  v_automatic bigint;
  v_total bigint;
  v_upserted integer := 0;
  v_changed integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_user_name := btrim(COALESCE(r->>'user_name', ''));
    v_runrunit_user_id := btrim(COALESCE(r->>'runrunit_user_id', ''));
    v_runrunit_user_name := NULLIF(btrim(COALESCE(r->>'runrunit_user_name', '')), '');
    v_work_date := (r->>'work_date')::date;
    v_manual := COALESCE((r->>'manual_seconds')::bigint, 0);
    v_automatic := COALESCE((r->>'automatic_seconds')::bigint, 0);
    v_total := COALESCE((r->>'total_seconds')::bigint, 0);

    CONTINUE WHEN v_user_name = '' OR v_runrunit_user_id = '' OR v_work_date IS NULL;

    SELECT * INTO prev
      FROM public.dashboard_user_daily_worked
     WHERE user_name = v_user_name AND work_date = v_work_date
     FOR UPDATE;

    IF FOUND THEN
      IF prev.manual_seconds IS DISTINCT FROM v_manual
         OR prev.automatic_seconds IS DISTINCT FROM v_automatic
         OR prev.total_seconds IS DISTINCT FROM v_total THEN
        INSERT INTO public.dashboard_worked_hours_history (
          import_id, user_name, runrunit_user_id, work_date,
          previous_manual_seconds, new_manual_seconds,
          previous_automatic_seconds, new_automatic_seconds,
          previous_total_seconds, new_total_seconds)
        VALUES (
          p_import_id, v_user_name, v_runrunit_user_id, v_work_date,
          prev.manual_seconds, v_manual,
          prev.automatic_seconds, v_automatic,
          prev.total_seconds, v_total);
        v_changed := v_changed + 1;
      END IF;

      UPDATE public.dashboard_user_daily_worked SET
        runrunit_user_id = v_runrunit_user_id,
        runrunit_user_name = v_runrunit_user_name,
        manual_seconds = v_manual,
        automatic_seconds = v_automatic,
        total_seconds = v_total,
        import_id = p_import_id,
        last_imported_at = now(),
        updated_at = now()
       WHERE id = prev.id;
    ELSE
      INSERT INTO public.dashboard_user_daily_worked (
        user_name, runrunit_user_id, runrunit_user_name, work_date,
        manual_seconds, automatic_seconds, total_seconds, import_id, last_imported_at)
      VALUES (
        v_user_name, v_runrunit_user_id, v_runrunit_user_name, v_work_date,
        v_manual, v_automatic, v_total, p_import_id, now());
    END IF;

    v_upserted := v_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted, 'changed', v_changed);
END $$;

REVOKE ALL ON FUNCTION public.dashboard_apply_worked_hours(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_apply_worked_hours(uuid, jsonb) TO service_role;
