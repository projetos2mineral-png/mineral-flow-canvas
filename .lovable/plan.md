# Plano de Implementação: Identificação da Origem da Busca Geral

Este plano descreve as alterações para identificar e exibir se a última busca geral de projetos foi realizada de forma **Manual** ou **Automática**.

## 1. Banco de Dados (Supabase)
Adicionaremos a coluna `sync_source` à tabela `dashboard_sync_status` para registrar a origem.

- **Ação:** Executar migração SQL para adicionar `sync_source` (TEXT).
- **Impacto:** Permite persistir a origem da busca.

## 2. Lógica de Negócio (Frontend)
Atualizaremos a chamada da Edge Function para enviar a origem "Manual" quando o usuário clica no botão.

- **Arquivo:** `src/lib/projects.ts`
- **Alteração:** Modificar `invokeDiscoverProjects` para aceitar um parâmetro opcional `source` (padrão "Automatic") e enviá-lo no corpo da requisição para a Edge Function.
- **Nota:** As rotinas automáticas (agendadas via Supabase Cron/Edge Functions) não enviarão o parâmetro, assumindo o padrão "Automatic" no servidor (ou o servidor deve ser ajustado se tivermos acesso, caso contrário, o frontend garante a marcação manual).

## 3. Interface do Usuário (UI)
Atualizaremos a exibição do status de sincronização na tela de seleção de projetos.

- **Arquivo:** `src/routes/_authenticated/selecionar-projetos.tsx`
- **Alterações:**
    - Atualizar a query `dashboard_sync_status` para buscar a nova coluna `sync_source`.
    - Formatar a string exibida para: `Última busca geral: [DATA] às [HORA] · [ORIGEM]`.
    - Lidar com o estado "ainda não realizada".

## Detalhes Técnicos
- O campo `sync_source` aceitará os valores `"Manual"` e `"Automática"`.
- A formatação seguirá o padrão pt-BR solicitado.

---
*Nota: Este plano assume que a Edge Function `sync-runrunit-discover-projects` é responsável por atualizar o `last_run_at` e agora também deverá atualizar o `sync_source` se receber o parâmetro, ou o frontend fará o update caso a Edge Function seja opaca.*
