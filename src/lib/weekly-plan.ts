import { supabase } from "@/integrations/supabase/client";

/**
 * Planejamento Semanal
 *
 * Dimensão INDEPENDENTE do Kanban mensal (`dashboard_project_cards`).
 * Tabela: public.dashboard_weekly_plan
 *
 * Regras:
 *  - Nada é alocado automaticamente: todo movimento é manual.
 *  - `week_number` 1..5 identifica a Semana 1-5 dentro de `reference_month`.
 *  - `week_number = NULL` significa Backlog (coluna "Sem fila" da visão semanal).
 *  - `position` define a prioridade da esquerda para a direita (dentro da
 *    semana OU dentro do Backlog).
 *  - `reference_month` é sempre YYYY-MM-01.
 *  - A tabela começa vazia e não guarda dados iniciais.
 */

export interface WeeklyPlanRow {
  id: string;
  runrunit_project_id: number;
  assignee_name: string;
  reference_month: string; // YYYY-MM-DD (YYYY-MM-01)
  week_number: number | null; // 1..5; null = Backlog
  position: number;
  created_at: string | null;
  updated_at: string | null;
}

const TABLE = "dashboard_weekly_plan";

const SELECT_COLUMNS =
  "id,runrunit_project_id,assignee_name,reference_month,week_number,position,created_at,updated_at";

/**
 * Normaliza qualquer entrada para YYYY-MM-01 (independente de fuso).
 * Rejeita entradas vazias/inválidas.
 */
export function normalizeReferenceMonth(value: string): string {
  const trimmed = (value ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(trimmed);
  if (!m) {
    throw new Error(`reference_month inválido: "${value}" (esperado YYYY-MM-01)`);
  }
  return `${m[1]}-${m[2]}-01`;
}

function assertWeekNumber(weekNumber: number | null): number | null {
  if (weekNumber === null) return null;
  const n = Number(weekNumber);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error(`week_number inválido: ${weekNumber} (esperado 1..5 ou null)`);
  }
  return n;
}

/**
 * Busca todas as posições semanais de um responsável para um mês.
 * Linha ausente = o card está no Backlog (não há registro até ser movido).
 */
export async function fetchWeeklyPlan(
  assigneeName: string,
  referenceMonth: string,
): Promise<WeeklyPlanRow[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq("assignee_name", assigneeName)
    .eq("reference_month", normalizeReferenceMonth(referenceMonth))
    .order("week_number", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WeeklyPlanRow[];
}

/**
 * Cria ou atualiza a posição semanal de um card.
 * Upsert pela unique (runrunit_project_id, assignee_name, reference_month).
 * `weekNumber = null` move o card para o Backlog.
 */
export async function upsertWeeklyPlacement(input: {
  runrunitProjectId: number;
  assigneeName: string;
  referenceMonth: string;
  weekNumber: number | null;
  position: number;
}): Promise<WeeklyPlanRow> {
  const row = {
    runrunit_project_id: input.runrunitProjectId,
    assignee_name: input.assigneeName,
    reference_month: normalizeReferenceMonth(input.referenceMonth),
    week_number: assertWeekNumber(input.weekNumber),
    position: Math.max(0, Math.floor(Number(input.position) || 0)),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .upsert(row, { onConflict: "runrunit_project_id,assignee_name,reference_month" })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as WeeklyPlanRow;
}

/**
 * Move um card para o Backlog (week_number = NULL), mantendo sua posição.
 * Se o card ainda não tinha registro semanal, cria um no Backlog.
 */
export async function moveToBacklog(input: {
  runrunitProjectId: number;
  assigneeName: string;
  referenceMonth: string;
  position: number;
}): Promise<WeeklyPlanRow> {
  return upsertWeeklyPlacement({ ...input, weekNumber: null });
}

/**
 * Atualiza várias posições/semans de uma vez (arrasto no quadro semanal).
 * Atualizações sequenciais, mesmo padrão de `bulkUpdateCardPositions`.
 * Só trabalha na tabela dashboard_weekly_plan.
 */
export async function bulkUpdateWeeklyPositions(
  updates: { id: string; week_number: number | null; position: number }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const u of updates) {
    const { error } = await (supabase as any)
      .from(TABLE)
      .update({
        week_number: assertWeekNumber(u.week_number),
        position: Math.max(0, Math.floor(Number(u.position) || 0)),
        updated_at: now,
      })
      .eq("id", u.id);
    if (error) throw error;
  }
}
