-- Checklist genérico das Demandas Avulsas.
--
-- Os itens pertencem à demanda (compartilhados por todos os responsáveis);
-- as marcações pertencem a cada linha de responsável. Nenhuma coluna ou
-- tabela de clientes é utilizada.
--
-- Se uma versão anterior/local deste checklist já tiver gravado dados nas
-- colunas `client_names` / `client_selections`, eles são copiados para as
-- colunas genéricas abaixo, sem excluir nada.

ALTER TABLE public.dashboard_manual_demands
  ADD COLUMN IF NOT EXISTS checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.dashboard_manual_demand_assignees
  ADD COLUMN IF NOT EXISTS checklist_selections jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_manual_demands'
      AND column_name = 'client_names'
  ) THEN
    EXECUTE $sql$
      UPDATE public.dashboard_manual_demands
         SET checklist_items = COALESCE(client_names, '[]'::jsonb)
       WHERE client_names IS NOT NULL
         AND jsonb_array_length(checklist_items) = 0
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dashboard_manual_demand_assignees'
      AND column_name = 'client_selections'
  ) THEN
    EXECUTE $sql$
      UPDATE public.dashboard_manual_demand_assignees
         SET checklist_selections = COALESCE(client_selections, '[]'::jsonb)
       WHERE client_selections IS NOT NULL
         AND jsonb_array_length(checklist_selections) = 0
    $sql$;
  END IF;
END
$migration$;

COMMENT ON COLUMN public.dashboard_manual_demands.checklist_items IS
  'Itens textuais do checklist da demanda avulsa (compartilhados entre responsáveis).';

COMMENT ON COLUMN public.dashboard_manual_demand_assignees.checklist_selections IS
  'Itens marcados por este responsável (marcações individuais por demanda).';
