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

/**
 * Formata horas decimais para exibição amigável no cabeçalho das lanes.
 *
 * Regras visuais:
 * - valores menores que 1 hora → minutos (ex: 0,8h → 48min)
 * - valores maiores ou iguais a 1 hora → horas e minutos (ex: 2,5h → 2h30)
 * - minutos são sempre arredondados para número inteiro
 *
 * O valor numérico de entrada permanece inalterado; apenas a string de
 * exibição é transformada.
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
 * Reservado para a futura comparação com a capacidade mensal do responsável.
 * Ainda não utilizado na UI.
 */
export interface LaneCapacitySummary {
  /** Horas planejadas somadas dos cards da lane. */
  plannedHours: number;
  /** Capacidade mensal do responsável (horas). Indefinida enquanto não houver fonte. */
  capacityHours?: number;
}
