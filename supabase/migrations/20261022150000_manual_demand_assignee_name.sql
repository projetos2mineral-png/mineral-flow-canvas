ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS assignee_name text;
ALTER TABLE public.dashboard_manual_demand_assignees
  ALTER COLUMN user_id DROP NOT NULL;
