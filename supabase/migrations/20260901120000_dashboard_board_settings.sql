CREATE TABLE IF NOT EXISTS public.dashboard_board_settings (
    assignee_name text PRIMARY KEY,
    antecedence_days integer NOT NULL DEFAULT 0 CHECK (antecedence_days >= 0),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_board_settings TO authenticated;
GRANT ALL ON public.dashboard_board_settings TO service_role;

ALTER TABLE public.dashboard_board_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read board settings"
ON public.dashboard_board_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to manage board settings"
ON public.dashboard_board_settings FOR ALL TO authenticated
USING (true)
WITH CHECK (true);
