ALTER TABLE public.dashboard_project_cards
  ADD COLUMN IF NOT EXISTS is_tec boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_geo boolean NOT NULL DEFAULT false;
