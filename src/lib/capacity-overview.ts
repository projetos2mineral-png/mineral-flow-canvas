/**
 * Camada de leitura da aba "Capacidade".
 *
 * Nada aqui grava dados: apenas cruza informações que JÁ existem no sistema
 * (filas mensais, cards do Kanban com estimativas, demandas avulsas e a
 * capacidade mensal cadastrada em `dashboard_user_capacity`).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  isMonthlyLaneTitle,
  monthlyLaneTitle,
  monthlyTitleToDateISO,
  type DashboardUser,
  type Lane,
  type ProjectCardRow,
} from "@/lib/dashboard";
import { buildDemandBoardCards } from "@/lib/dashboard-demands";
import type { ManualDemand } from "@/lib/manual-demands";

export interface CapacityRow {
  /** Nome do colaborador (dashboard_users.name). */
  userName: string;
  /** Horas disponíveis no período (soma das capacidades mensais cadastradas). */
  availableHours: number;
  /** Horas estimadas atribuídas (projetos Runrun.it + demandas avulsas). */
  estimatedHours: number;
  /** Horas vindas de projetos do Runrun.it. */
  projectHours: number;
  /** Horas vindas de demandas avulsas. */
  demandHours: number;
  /** Ocupação em % (null quando não há capacidade cadastrada). */
  occupancy: number | null;
  /** Saldo = disponíveis - estimadas (null sem capacidade cadastrada). */
  balance: number | null;
  status: CapacityStatus;
}

export type CapacityStatus = "sem-capacidade" | "baixa" | "adequada" | "sobrecarregada";

export const CAPACITY_STATUS_LABEL: Record<CapacityStatus, string> = {
  "sem-capacidade": "Sem capacidade cadastrada",
  baixa: "Baixa",
  adequada: "Adequada",
  sobrecarregada: "Sobrecarregada",
};

/** Classes visuais alinhadas ao restante do painel (tokens semânticos + realce). */
export const CAPACITY_STATUS_CLASS: Record<CapacityStatus, string> = {
  "sem-capacidade": "bg-muted text-muted-foreground border-border",
  baixa: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  adequada: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  sobrecarregada: "bg-red-600/10 text-red-600 border-red-600/30",
};

export function capacityStatus(occupancy: number | null): CapacityStatus {
  if (occupancy === null) return "sem-capacidade";
  if (occupancy > 100) return "sobrecarregada";
  if (occupancy < 70) return "baixa";
  return "adequada";
}

export interface UserCapacityRow {
  user_name: string;
  reference_month: string;
  capacity_hours: number | null;
}

/** Todas as capacidades cadastradas (tabela pequena: uma linha por pessoa/mês). */
export async function fetchAllCapacities(): Promise<UserCapacityRow[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_user_capacity")
    .select("user_name,reference_month,capacity_hours");
  if (error) throw error;
  return (data ?? []) as UserCapacityRow[];
}

/** Lista ordenada de meses (títulos "Mês/AAAA") presentes nos dados. */
export function collectMonths(lanes: Lane[], capacities: UserCapacityRow[], demandMonths: string[]): string[] {
  const set = new Set<string>();
  for (const l of lanes) if (isMonthlyLaneTitle(l.title)) set.add(l.title.trim());
  for (const c of capacities) {
    if (!c.reference_month) continue;
    const t = monthlyLaneTitle(c.reference_month);
    if (t) set.add(t);
  }
  for (const m of demandMonths) if (m) set.add(m);

  return Array.from(set).sort((a, b) => {
    const da = monthlyTitleToDateISO(a) ?? "";
    const db = monthlyTitleToDateISO(b) ?? "";
    return da.localeCompare(db);
  });
}

export interface BuildCapacityInput {
  users: DashboardUser[];
  lanes: Lane[];
  cards: ProjectCardRow[];
  demands: ManualDemand[];
  capacities: UserCapacityRow[];
  /** Meses considerados. Vazio = todos. */
  months: string[];
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildCapacityRows(input: BuildCapacityInput): CapacityRow[] {
  const { users, lanes, cards, demands, capacities } = input;
  const monthFilter = input.months.length ? new Set(input.months) : null;
  const inPeriod = (title: string) => (monthFilter ? monthFilter.has(title) : true);

  const activeUsers = users.filter((u) => u.is_active !== false);
  const rows = new Map<string, CapacityRow>();
  const ensure = (name: string): CapacityRow => {
    const key = name.trim();
    let r = rows.get(key);
    if (!r) {
      r = {
        userName: key,
        availableHours: 0,
        estimatedHours: 0,
        projectHours: 0,
        demandHours: 0,
        occupancy: null,
        balance: null,
        status: "sem-capacidade",
      };
      rows.set(key, r);
    }
    return r;
  };
  for (const u of activeUsers) ensure(u.name);

  // Horas disponíveis
  const hasCapacity = new Set<string>();
  for (const c of capacities) {
    if (!c.user_name || !c.reference_month) continue;
    const title = monthlyLaneTitle(c.reference_month);
    if (!inPeriod(title)) continue;
    const r = ensure(c.user_name);
    r.availableHours += toNumber(c.capacity_hours);
    hasCapacity.add(r.userName);
  }

  // Horas estimadas de projetos: cards posicionados em filas mensais
  const laneById = new Map(lanes.map((l) => [l.id, l]));
  for (const card of cards) {
    if (!card.lane_id) continue;
    const lane = laneById.get(card.lane_id);
    if (!lane || !isMonthlyLaneTitle(lane.title)) continue;
    if (!inPeriod(lane.title.trim())) continue;
    const r = ensure(lane.assignee_name || card.assignee_name || "Sem responsável");
    r.projectHours += toNumber(card.total_estimated_hours);
  }

  // Horas estimadas de demandas avulsas (horas individuais, nunca divididas)
  for (const d of buildDemandBoardCards(demands, users)) {
    if (!inPeriod(d.laneTitle)) continue;
    ensure(d.assigneeName).demandHours += toNumber(d.ownHours);
  }

  for (const r of rows.values()) {
    r.estimatedHours = r.projectHours + r.demandHours;
    if (hasCapacity.has(r.userName) && r.availableHours > 0) {
      r.occupancy = (r.estimatedHours / r.availableHours) * 100;
      r.balance = r.availableHours - r.estimatedHours;
    }
    r.status = capacityStatus(r.occupancy);
  }

  return Array.from(rows.values()).sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
}

export interface CapacityTotals {
  availableHours: number;
  estimatedHours: number;
  balance: number;
  occupancy: number | null;
  overloaded: number;
  low: number;
  adequate: number;
}

export function summarizeCapacity(rows: CapacityRow[]): CapacityTotals {
  let availableHours = 0;
  let estimatedHours = 0;
  let overloaded = 0;
  let low = 0;
  let adequate = 0;

  for (const r of rows) {
    availableHours += r.availableHours;
    estimatedHours += r.estimatedHours;
    if (r.status === "sobrecarregada") overloaded += 1;
    else if (r.status === "baixa") low += 1;
    else if (r.status === "adequada") adequate += 1;
  }

  return {
    availableHours,
    estimatedHours,
    balance: availableHours - estimatedHours,
    occupancy: availableHours > 0 ? (estimatedHours / availableHours) * 100 : null,
    overloaded,
    low,
    adequate,
  };
}

/** Formata horas decimais no padrão pt-BR usado no painel (ex.: "18,5h"). */
export function formatHours(hours: number): string {
  const value = Number.isFinite(hours) ? hours : 0;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}
