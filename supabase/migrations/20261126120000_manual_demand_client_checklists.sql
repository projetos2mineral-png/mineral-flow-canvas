-- Lista de clientes compartilhada pela demanda avulsa e marcações
-- individuais por responsável (checkboxes do modal do card).
--
-- A lista fica na própria demanda; cada linha de responsável guarda apenas
-- as suas seleções. Assim, editar/marcar um responsável nunca sobrescreve
-- as marcações dos demais.

ALTER TABLE public.dashboard_manual_demands
  ADD COLUMN IF NOT EXISTS client_names jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS client_selections jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dashboard_manual_demands.client_names IS
  'Lista de clientes cadastrada para a demanda avulsa (compartilhada entre responsáveis).';

COMMENT ON COLUMN public.dashboard_manual_demand_assignees.client_selections IS
  'Clientes marcados por este responsável para a demanda avulsa (individual).';
