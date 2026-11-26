ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dashboard_manual_demand_assignees.checklist_items IS
  'Itens do checklist exclusivos deste card/responsável.';