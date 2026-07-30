
-- 1. Recreate views as SECURITY INVOKER so RLS of querying user applies
DROP VIEW IF EXISTS public.v_project_people;
CREATE VIEW public.v_project_people
WITH (security_invoker = true) AS
SELECT p.runrunit_project_id,
    p.name AS project_name,
    p.client_name,
    p.project_group_name,
    p.project_sub_group_name,
    p.created_at_runrunit,
    pp.assignee_id,
    pp.assignee_name,
    pp.team_id,
    pp.team_name,
    pp.last_synced_at
FROM runrunit_projects p
LEFT JOIN runrunit_project_people pp ON pp.runrunit_project_id = p.runrunit_project_id
WHERE p.is_open = true;

DROP VIEW IF EXISTS public.v_dashboard_projects;
CREATE VIEW public.v_dashboard_projects
WITH (security_invoker = true) AS
SELECT p.runrunit_project_id,
    p.name AS project_name,
    p.client_name,
    p.project_group_name,
    p.created_at_runrunit,
    pp.assignee_name,
    pp.team_name,
    pp.last_synced_at,
    c.id AS card_id,
    c.lane_id,
    c.status,
    c."position"
FROM runrunit_projects p
JOIN runrunit_project_people pp ON pp.runrunit_project_id = p.runrunit_project_id
LEFT JOIN dashboard_project_cards c
  ON c.runrunit_project_id = p.runrunit_project_id
 AND c.assignee_name = pp.assignee_name
WHERE p.is_open = true AND p.is_tracking_enabled = true;

GRANT SELECT ON public.v_project_people TO authenticated;
GRANT SELECT ON public.v_dashboard_projects TO authenticated;

-- 2. Restrict SECURITY DEFINER function from being called by API roles
REVOKE EXECUTE ON FUNCTION public.handle_new_dashboard_user() FROM PUBLIC, anon, authenticated;

-- 3. Tighten overly permissive policies (remove anon access, require authenticated)
DROP POLICY IF EXISTS "Allow read runrunit_projects" ON public.runrunit_projects;
CREATE POLICY "Authenticated read runrunit_projects" ON public.runrunit_projects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow update runrunit_projects tracking" ON public.runrunit_projects;
CREATE POLICY "Authenticated update runrunit_projects tracking" ON public.runrunit_projects
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read dashboard_lanes" ON public.dashboard_lanes;
DROP POLICY IF EXISTS "Allow insert dashboard_lanes" ON public.dashboard_lanes;
DROP POLICY IF EXISTS "Allow update dashboard_lanes" ON public.dashboard_lanes;
DROP POLICY IF EXISTS "Allow delete dashboard_lanes" ON public.dashboard_lanes;
CREATE POLICY "Authenticated read dashboard_lanes" ON public.dashboard_lanes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert dashboard_lanes" ON public.dashboard_lanes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update dashboard_lanes" ON public.dashboard_lanes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete dashboard_lanes" ON public.dashboard_lanes
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read dashboard_project_cards" ON public.dashboard_project_cards;
DROP POLICY IF EXISTS "Allow insert dashboard_project_cards" ON public.dashboard_project_cards;
DROP POLICY IF EXISTS "Allow update dashboard_project_cards" ON public.dashboard_project_cards;
DROP POLICY IF EXISTS "Allow delete dashboard_project_cards" ON public.dashboard_project_cards;
CREATE POLICY "Authenticated read dashboard_project_cards" ON public.dashboard_project_cards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert dashboard_project_cards" ON public.dashboard_project_cards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update dashboard_project_cards" ON public.dashboard_project_cards
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete dashboard_project_cards" ON public.dashboard_project_cards
  FOR DELETE TO authenticated USING (true);

-- 4. Add SELECT policy for authenticated users to read project_people/tasks (used by app views)
CREATE POLICY "Authenticated read runrunit_project_people" ON public.runrunit_project_people
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read runrunit_tasks" ON public.runrunit_tasks
  FOR SELECT TO authenticated USING (true);

-- sync_control intentionally has no policy — only service_role accesses it.

-- Revoke anon table-level grants on tightened tables so anon truly cannot reach them
REVOKE ALL ON public.runrunit_projects FROM anon;
REVOKE ALL ON public.dashboard_lanes FROM anon;
REVOKE ALL ON public.dashboard_project_cards FROM anon;
