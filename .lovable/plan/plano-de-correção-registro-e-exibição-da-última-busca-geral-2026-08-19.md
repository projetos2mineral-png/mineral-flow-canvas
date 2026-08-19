# Plano de Correção: Registro e Exibição da Última Busca Geral (Revisado)

O objetivo deste plano é garantir que a busca de novos projetos registre corretamente a data/hora e a origem (Manual/Automática) na tabela `dashboard_sync_status`.

## 1. Investigação e Diagnóstico
- **Estrutura Atual:** A tabela `dashboard_sync_status` existe, mas não possui a coluna `sync_source`. Ela contém as colunas `sync_name` (PK) e `last_run_at`.
- **Edge Function:** Como o código da Edge Function `sync-runrunit-discover-projects` não está disponível no sistema de arquivos local para inspeção direta, e o usuário indicou que a busca manual **não** está atualizando a interface, a causa mais provável é que a função não esteja realizando o `upsert` no banco ou não esteja recebendo a permissão necessária.
- **RLS:** Verifiquei que a tabela tem RLS ativo e não permite escrita pela role `anon`. O frontend não deve realizar o registro; a Edge Function (via `service_role`) deve ser a responsável.

## 2. Implementação do Banco de Dados
Adicionaremos a coluna necessária via SQL Editor no Supabase (já que a ferramenta de migration direta não está disponível ou a tabela é gerenciada externamente).
- **Ação:** Solicitar ao usuário ou executar via SQL Editor (se disponível no ambiente Lovable Cloud) o seguinte comando:
  ```sql
  ALTER TABLE public.dashboard_sync_status ADD COLUMN IF NOT EXISTS sync_source TEXT;
  ```

## 3. Lógica da Edge Function
A Edge Function `sync-runrunit-discover-projects` deve ser atualizada para:
1. Receber o parâmetro `source` (o frontend já envia "Manual").
2. Ao concluir a descoberta com sucesso, executar:
   ```sql
   INSERT INTO public.dashboard_sync_status (sync_name, last_run_at, sync_source)
   VALUES ('discover_projects', now(), source_parameter)
   ON CONFLICT (sync_name) DO UPDATE 
   SET last_run_at = EXCLUDED.last_run_at, 
       sync_source = EXCLUDED.sync_source;
   ```

## 4. Frontend (Ajustes de UI)
- **Arquivo:** `src/routes/_authenticated/selecionar-projetos.tsx`
- **Alterações:**
    - Atualizar a exibição para incluir a origem: `Última busca geral: {data} às {hora} · {sync_source}`.
    - Manter a invalidação da query `dashboard_sync_status` após o sucesso da chamada da função no `handleDiscover`.

## Resumo das Alterações
- **Backend:** Adição de coluna e lógica de registro na Edge Function.
- **Frontend:** Atualização da exibição de texto e gestão de cache.
