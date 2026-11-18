-- Posição individual do card de demanda avulsa no quadro de cada responsável.
-- lane_id NULL + manually_positioned=false => fila derivada da data desejada.
-- lane_id NULL + manually_positioned=true  => "Sem fila" escolhida pelo usuário.
ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS lane_id uuid REFERENCES public.dashboard_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_positioned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS dashboard_manual_demand_assignees_lane_id_idx
  ON public.dashboard_manual_demand_assignees (lane_id);
