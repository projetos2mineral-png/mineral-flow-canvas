import { monthlyLaneTitle } from "@/lib/dashboard";
import type { DashboardUser } from "@/lib/dashboard";
import {
  totalEstimatedHours,
  type ManualDemand,
} from "@/lib/manual-demands";

/**
 * Integração das Demandas Avulsas com o Painel Geral.
 *
 * Os cards são DERIVADOS em tempo real de `dashboard_manual_demands` +
 * `dashboard_manual_demand_assignees`. Nada é gravado em
 * `dashboard_project_cards`, o que torna a integração naturalmente
 * idempotente: recarregar a página, editar a demanda ou alternar o switch
 * apenas recalcula a lista — nunca duplica cards.
 *
 * A posição temporal vem exclusivamente de `desired_date` (mês/ano nunca são
 * persistidos). A futura visão semanal poderá usar a mesma data.
 */
export interface DemandBoardCard {
  /** Chave estável: demanda + responsável. Evita duplicidade de renderização. */
  key: string;
  demand: ManualDemand;
  /** Nome do responsável (dashboard_users.name) dono deste quadro. */
  assigneeName: string;
  /** Horas individuais deste responsável — nunca divididas entre pessoas. */
  ownHours: number;
  /** Soma das horas de todos os responsáveis da demanda. */
  totalHours: number;
  /** Responsáveis com suas horas individuais, para exibição no card. */
  people: { name: string; hours: number }[];
  /** Título da fila mensal derivado de desired_date (ex.: "Setembro/2026"). */
  laneTitle: string;
}

/** Somente demandas ativas e marcadas para exibição entram no Painel Geral. */
export function isDemandVisibleOnDashboard(d: ManualDemand): boolean {
  return d.is_visible_on_dashboard === true && d.status === "Ativa";
}

/**
 * Converte demandas visíveis em cards por responsável.
 * Um responsável sem correspondência em `dashboard_users` é ignorado.
 */
export function buildDemandBoardCards(
  demands: ManualDemand[],
  users: DashboardUser[]
): DemandBoardCard[] {
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const out: DemandBoardCard[] = [];

  for (const demand of demands) {
    if (!isDemandVisibleOnDashboard(demand)) continue;
    if (!demand.desired_date) continue;

    const laneTitle = monthlyLaneTitle(demand.desired_date);
    if (!laneTitle) continue;

    const totalHours = totalEstimatedHours(demand.assignees);
    const people = demand.assignees.map((a) => ({
      name: nameById.get(a.user_id) ?? "Sem responsável",
      hours: Number(a.estimated_hours) || 0,
    }));

    for (const a of demand.assignees) {
      const assigneeName = nameById.get(a.user_id);
      if (!assigneeName) continue;
      out.push({
        key: `demand:${demand.id}:${a.user_id}`,
        demand,
        assigneeName,
        ownHours: Number(a.estimated_hours) || 0,
        totalHours,
        people,
        laneTitle,
      });
    }
  }

  return out;
}

/** Formata a data desejada (YYYY-MM-DD) como dd/mm/aaaa, sem deslocar fuso. */
export function formatDesiredDate(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-");
  if (!y || !m || !d) return dateISO;
  return `${d}/${m}/${y}`;
}
