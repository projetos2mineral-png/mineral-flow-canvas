/**
 * Utilitários de horas planejadas por coluna (lane) do Kanban.
 *
 * Escopo atual: apenas somar e formatar as horas estimadas dos cards de uma lane.
 * A estrutura abaixo já prevê a futura comparação com a capacidade mensal do
 * responsável, mas essa funcionalidade ainda NÃO está implementada.
 */

/** Forma mínima que um card precisa ter para entrar na soma. */
export interface LaneHoursSource {
  card?: { total_estimated_hours?: number | null } | null;
}

/**
 * Soma `total_estimated_hours` dos cards da lane, ignorando valores
 * ausentes ou não numéricos. Retorna 0 quando não há nada a somar.
 */
export function sumLaneEstimatedHours(cards: readonly LaneHoursSource[]): number {
  let total = 0;
  for (const c of cards) {
    const raw = c.card?.total_estimated_hours;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/** Formata horas em formato compacto pt-BR: 18,5h / 20h. */
export function formatHoursCompact(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `${text}h`;
}

/**
 * Reservado para a futura comparação com a capacidade mensal do responsável.
 * Ainda não utilizado na UI.
 */
export interface LaneCapacitySummary {
  /** Horas planejadas somadas dos cards da lane. */
  plannedHours: number;
  /** Capacidade mensal do responsável (horas). Indefinida enquanto não houver fonte. */
  capacityHours?: number;
}
