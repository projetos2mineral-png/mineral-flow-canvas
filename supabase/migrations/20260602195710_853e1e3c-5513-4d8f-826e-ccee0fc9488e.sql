
-- Grant anon/authenticated access to read runrunit_projects and toggle is_tracking_enabled
GRANT SELECT, UPDATE ON public.runrunit_projects TO anon, authenticated;
GRANT ALL ON public.runrunit_projects TO service_role;

ALTER TABLE public.runrunit_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read runrunit_projects" ON public.runrunit_projects;
CREATE POLICY "Allow read runrunit_projects"
ON public.runrunit_projects FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow update runrunit_projects tracking" ON public.runrunit_projects;
CREATE POLICY "Allow update runrunit_projects tracking"
ON public.runrunit_projects FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Make sure dashboard view is reachable
GRANT SELECT ON public.v_dashboard_projects TO anon, authenticated;
GRANT SELECT ON public.v_project_people TO anon, authenticated;
