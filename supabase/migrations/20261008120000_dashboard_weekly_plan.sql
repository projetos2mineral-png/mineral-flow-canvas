CREATE TABLE IF NOT EXISTS public.dashboard_weekly_plan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    runrunit_project_id integer NOT NULL,
    assignee_name text NOT NULL,
    reference_month date NOT NULL, -- Sempre YYYY-MM-01
    week_number smallint CHECK (week_number BETWEEN 1 AND 5), -- NULL = Backlog
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (runrunit_project_id, assignee_name, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_weekly_plan_board
    ON public.dashboard_weekly_plan (assignee_name, reference_month, week_number, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_weekly_plan TO authenticated;
GRANT ALL ON public.dashboard_weekly_plan TO service_role;

ALTER TABLE public.dashboard_weekly_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read weekly plan"
ON public.dashboard_weekly_plan FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to manage weekly plan"
ON public.dashboard_weekly_plan FOR ALL TO authenticated
USING (true)
WITH CHECK (true);
