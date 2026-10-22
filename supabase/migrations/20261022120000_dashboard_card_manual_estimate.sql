-- Ajuste manual de horas estimadas por card. NULL = usar estimativa automática.
ALTER TABLE public.dashboard_project_cards
  ADD COLUMN IF NOT EXISTS manual_estimated_hours numeric(10,2)
  CHECK (manual_estimated_hours IS NULL OR (manual_estimated_hours >= 0 AND manual_estimated_hours <= 10000));
