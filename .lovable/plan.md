# Plano de Correção: Registro e Exibição da Última Busca Geral

O objetivo deste plano é garantir que a busca manual de novos projetos atualize corretamente o registro de status e exiba a origem (Manual/Automática) na interface.

## 1. Banco de Dados
Garantir que a tabela `dashboard_sync_status` possua a coluna `sync_source`. Como não identifiquei a migração que a criou, criarei uma nova migração defensiva.

- **Arquivo:** `supabase/migrations/20260819000000_sync_status_source.sql`
- **Conteúdo:**
    - Criar a tabela `dashboard_sync_status` se não existir.
    - Adicionar a coluna `sync_source` (TEXT) se não existir.
    - Configurar RLS e permissões para permitir que usuários autenticados leiam e a Edge Function (service_role) atualize.

## 2. Backend (Edge Function / Lógica)
Embora a Edge Function `sync-runrunit-discover-projects` seja opaca, o frontend já está enviando o parâmetro `{ source: "Manual" }`. Se a Edge Function não estiver atualizando o registro, adicionaremos um passo explícito no frontend após a conclusão da busca para garantir o registro correto.

## 3. Frontend (Integração e UI)
Corrigir a interface para atualizar imediatamente após a busca e exibir os dados corretamente.

- **Arquivo:** `src/routes/_authenticated/selecionar-projetos.tsx`
    - Adicionar uma chamada explícita para atualizar o `dashboard_sync_status` no banco após a execução bem-sucedida de `invokeDiscoverProjects` no `handleDiscover`.
    - Garantir que a query do React Query seja invalidada e atualizada.
    - Ajustar a formatação da exibição conforme solicitado.

## Detalhes Técnicos
- **Tabela:** `public.dashboard_sync_status`
- **Colunas:** `sync_name` (PK), `last_run_at`, `sync_source`.
- **Valores Origem:** `"Manual"` e `"Automática"`.
- **Fluxo Manual:** Clique → `invokeDiscoverProjects("Manual")` → Update `dashboard_sync_status` → Toast Sucesso → UI Refresh.
