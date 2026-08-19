# Plano de Correção: Origem da Busca Geral

O objetivo é garantir que a coluna `sync_source` exista no banco de dados, que a Edge Function a utilize para registrar a origem (Manual/Automática) e que o frontend exiba essa informação corretamente.

## Alterações Técnicas

### 1. Banco de Dados (Supabase)
- Adicionar coluna `sync_source` (TEXT) à tabela `public.dashboard_sync_status`.
- Garantir permissões de leitura para a role `authenticated` e acesso total para `service_role`.
- Criar o registro `discover_projects` inicial caso não exista.

### 2. Backend (Edge Function)
- A Edge Function `sync-runrunit-discover-projects` deve ser a responsável por atualizar `last_run_at`, `last_result`, `updated_at` e o novo campo `sync_source` com base no parâmetro `source` recebido ("Manual" ou "Automática").

### 3. Frontend (React/TanStack Start)
- **src/routes/_authenticated/selecionar-projetos.tsx**:
    - Ajustar a consulta do `syncStatus` para ler `sync_source`.
    - Refinar a exibição da string "Última busca geral" para incluir a origem formatada.
    - Garantir que, se `sync_source` for nulo (registros antigos), a interface apenas omita a origem em vez de exibir "ainda não realizada" ou inventar um valor.
- **src/lib/projects.ts**:
    - Garantir que a chamada `invokeDiscoverProjects` envie o parâmetro `source` corretamente.

## Verificação
- Confirmar a existência da coluna via script de inspeção.
- Executar uma busca manual no preview e verificar se o banco atualiza `sync_source` para 'Manual'.
- Validar se a UI reflete "· Manual" após a conclusão.
