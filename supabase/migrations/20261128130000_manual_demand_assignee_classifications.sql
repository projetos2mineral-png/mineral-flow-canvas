ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS is_tec boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_geo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_rev boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_campo boolean NOT NULL DEFAULT false;