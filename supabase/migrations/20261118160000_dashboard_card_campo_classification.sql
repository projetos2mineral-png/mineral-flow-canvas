ALTER TABLE public.dashboard_project_cards
  ADD COLUMN IF NOT EXISTS is_campo boolean NOT NULL DEFAULT false;
