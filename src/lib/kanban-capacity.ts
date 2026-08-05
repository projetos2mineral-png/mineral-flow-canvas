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
 * Soma total_estimated_hours dos cards da lane, ignorando valores
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

/**
 * Formata horas decimais para exibição amigável no cabeçalho das lanes.
 */
export function formatHoursCompact(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0min";

  const totalMinutes = Math.round(hours * 60);

  if (hours < 1) {
    return `${totalMinutes}min`;
  }

  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h${minutes}`;
}

/**
 * Estrutura para comparação entre planejado e capacidade.
 */
export interface LaneCapacitySummary {
  /** Horas planejadas somadas dos cards da lane. */
  plannedHours: number;
  /** Capacidade mensal do responsável (horas). */
  capacityHours: number | null;
}

/**
 * Determina se houve excesso de carga.
 */
export function isOverCapacity(summary: LaneCapacitySummary): boolean {
  if (summary.capacityHours === null || summary.capacityHours === 0) return false;
  return summary.plannedHours > summary.capacityHours;
}

/**
 * Calcula o excesso de horas se houver.
 */
export function getCapacityExcess(summary: LaneCapacitySummary): number {
  if (summary.capacityHours === null) return 0;
  return Math.max(0, summary.plannedHours - summary.capacityHours);
}

