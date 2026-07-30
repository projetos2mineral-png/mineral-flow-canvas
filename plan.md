# Plano de ajustes (front-end + camada de dados interna)

Escopo grande, dividido em 4 áreas. Nenhum dado oficial do Runrun.it é alterado — apenas tabelas internas (`dashboard_*`, `is_tracking_enabled`, `is_new_candidate`).

## 1. Dashboard (`src/routes/_authenticated/dashboard.tsx` + `src/lib/dashboard.ts`)

- **Último responsável aberto**: salvar aba ativa em `localStorage["last_dashboard_assignee"]`; ao montar, se existir e ainda estiver na lista, selecionar. Só cair no primeiro alfabético como fallback.
- **Preservar scroll/filtros**: scroll horizontal/vertical por responsável já existe; adicionar persistência dos filtros ativos (`localStorage["dashboard_filters"]`).
- **Ordem em filas mensais**: em `AssigneeBoard`, cards de lanes cujo título casa com `MMMM/AAAA`:
  - `manually_positioned=true` → mantêm `position` salvo (renderizados primeiro na ordem salva);
  - demais → ordenados por `desired_delivery_date ASC`, desempate por `project_name`.
- **Não duplicar filas mensais**:
  - Endurecer `ensureDefaultMonthlyLanes` em `src/lib/dashboard.ts`:
    - dedupe case-insensitive + trim antes de inserir;
    - após insert, capturar erro de `unique_dashboard_lane_assignee_title` e ignorar;
    - flag em memória (`Set` por assignee) por sessão para evitar chamadas repetidas.
  - Chamar `ensureDefaultMonthlyLanes` **apenas uma vez por responsável por sessão** (guard via `useRef`/module Set), não a cada render/refetch.
  - Adicionar utilitário `dedupeMonthlyLanes(lanes)` que, ao carregar, se detectar duplicatas do mesmo título por assignee, mantém a de menor `position` e reatribui cards da(s) duplicata(s) para a canônica, deletando o extra (limpeza defensiva).

## 2. Selecionar Projetos (`src/routes/_authenticated/selecionar-projetos.tsx` + `src/lib/projects.ts`)

- **Coluna "Data desejada"**: renderizar `desired_delivery_date` em `dd/mm/aaaa`.
- **Ordenação por data desejada**: controle discreto (botão toggle "Mais antiga" / "Mais recente"); aplicar `.order("desired_delivery_date", { ascending })` direto no Supabase em `fetchAllRunrunitProjects`. Padrão: ascendente. Manter demais filtros.
- **Após "Atualizar projetos exibidos"**: invalidar queries de dashboard, seleção e calendário; após refetch, executar realocação automática (item 6).
- **Realocação automática por mudança de data**: função `reallocateCardsByDesiredDate()` que, para cada card com `manually_positioned != true`, calcula a fila `Mês/AAAA` do assignee a partir de `desired_delivery_date`; se existir e for diferente da lane atual, atualiza `lane_id`.

## 3. Calendário (`src/routes/_authenticated/planejamento.tsx` + `dashboard.ts`)

- **Data efetiva** = `planning_date` (se existir) senão `desired_delivery_date`. Alterar `fetchPlanningProjects` para expor `effective_date` computado.
- **Alocação automática**: cards aparecem no dia da data efetiva sem precisar criar registro em `dashboard_project_planning`.
- **Movimentação manual (líder/admin)**: no drag/drop de dia, `upsertPlanning({ planning_date: novaData })`.
- **Botão "Usar data do Runrun.it"** no modal do card: `upsertPlanning({ planning_date: null })`.
- **Status/Detalhes**: criar registro sob demanda via `upsertPlanning`.
- **Permissões**: gate por `access_level` — `comum` só visualiza; `lider`/`administrador` editam/movem.
- **Filtros/visualizações**: manter Semana/Mês/Ano; recompor `effective_date` em todas.

## 4. Gerenciar Usuários (menu + `gerenciar-usuarios.tsx`)

- No sidebar/menu, para `administrador`, consultar `max(created_at)` de `dashboard_users`; comparar com `localStorage["last_seen_users_at"]`; se maior, mostrar badge vermelho "!" ao lado do link.
- Ao abrir a página, gravar `Date.now()` em `last_seen_users_at` e esconder badge.

## Notas técnicas

- Nenhuma migração SQL — todas as tabelas e colunas necessárias já existem (`manually_positioned`, `desired_delivery_date`, `planning_date`, `dashboard_users.created_at`, unique index).
- Selects continuam sem `raw_data`.
- Toda a UI permanece em pt-BR.
- Não altera código de Edge Functions.

Pronto para implementar em sequência (dashboard → selecionar → calendário → usuários) com verificação de build ao final.
