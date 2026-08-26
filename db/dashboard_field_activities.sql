-- Execute este SQL no Supabase (SQL Editor) para habilitar a funcionalidade
-- "Derivar campo" no Kanban.
--
-- Atividades de campo derivadas de um post-it (card) existente do Kanban.
-- O campo NÃO substitui o card original: é um registro relacionado, com
-- status, data e horas próprios, mantendo vínculo com o card de origem.

CREATE TABLE IF NOT EXISTS public.dashboard_field_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Vínculo com o post-it de origem. ON DELETE SET NULL para que excluir o
    -- card original não apague silenciosamente uma atividade já planejada.
    parent_card_id uuid REFERENCES public.dashboard_project_cards(id) ON DELETE SET NULL,
    runrunit_project_id integer NOT NULL,
    assignee_name text NOT NULL,
    lane_id uuid REFERENCES public.dashboard_lanes(id) ON DELETE SET NULL,
    activity text NOT NULL,
    planned_date date,
    estimated_minutes integer NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
    field_status text NOT NULL DEFAULT 'planejado'
        CHECK (field_status IN ('planejado','agendado','em andamento','realizado','cancelado')),
    note text,
    position integer NOT NULL DEFAULT 0,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_activities_parent ON public.dashboard_field_activities (parent_card_id);
CREATE INDEX IF NOT EXISTS idx_field_activities_assignee ON public.dashboard_field_activities (assignee_name);
CREATE INDEX IF NOT EXISTS idx_field_activities_lane ON public.dashboard_field_activities (lane_id);
CREATE INDEX IF NOT EXISTS idx_field_activities_date ON public.dashboard_field_activities (planned_date);
CREATE INDEX IF NOT EXISTS idx_field_activities_project ON public.dashboard_field_activities (runrunit_project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_field_activities TO authenticated;
GRANT ALL ON public.dashboard_field_activities TO service_role;

ALTER TABLE public.dashboard_field_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read field activities" ON public.dashboard_field_activities;
CREATE POLICY "Authenticated can read field activities"
ON public.dashboard_field_activities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can manage field activities" ON public.dashboard_field_activities;
CREATE POLICY "Authenticated can manage field activities"
ON public.dashboard_field_activities FOR ALL TO authenticated
USING (true) WITH CHECK (true);
