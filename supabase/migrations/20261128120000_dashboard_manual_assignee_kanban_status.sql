ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS kanban_status text NOT NULL DEFAULT 'a iniciar';

COMMENT ON COLUMN public.dashboard_manual_demand_assignees.kanban_status IS
  'Status Kanban exclusivo do card deste responsável.';