DROP VIEW IF EXISTS public.v_dashboard_projects;

CREATE VIEW public.v_dashboard_projects AS
SELECT p.runrunit_project_id,
       p.name AS project_name,
       p.client_name,
       p.project_group_name,
       p.created_at_runrunit,
       p.desired_delivery_date,
       p.is_open,
       pp.assignee_name,
       pp.team_name,
       pp.last_synced_at,
       c.id AS card_id,
       c.lane_id,
       c.status,
       c."position"
  FROM runrunit_projects p
  JOIN runrunit_project_people pp ON pp.runrunit_project_id = p.runrunit_project_id
  LEFT JOIN dashboard_project_cards c ON c.runrunit_project_id = p.runrunit_project_id AND c.assignee_name = pp.assignee_name
 WHERE p.is_open = true AND p.is_tracking_enabled = true;

GRANT SELECT ON public.v_dashboard_projects TO authenticated;