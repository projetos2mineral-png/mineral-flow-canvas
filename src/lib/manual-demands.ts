import { supabase } from "@/integrations/supabase/client";

/**
 * Demandas Avulsas
 *
 * Demandas manuais, SEM qualquer vínculo com o Runrun.it.
 * Tabelas (já existentes no banco):
 *  - public.dashboard_manual_demands
 *  - public.dashboard_manual_demand_assignees
 *
 * Regras de negócio importantes:
 *  - A estimativa é INDIVIDUAL por responsável (nunca dividida automaticamente).
 *  - O total da demanda é sempre derivado (soma de estimated_hours), nunca armazenado.
 *  - Mês/ano/semana NÃO são armazenados: derivam de desired_date quando necessário.
 */

export const DEMAND_STATUSES = ["Ativa", "Concluída", "Cancelada"] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export interface DemandAssignee {
  id?: string;
  user_id: string;
  estimated_hours: number;
}

export interface ManualDemand {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  desired_date: string; // YYYY-MM-DD
  is_visible_on_dashboard: boolean;
  status: DemandStatus;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  assignees: DemandAssignee[];
}

export interface ManualDemandInput {
  name: string;
  description: string | null;
  client_name: string | null;
  desired_date: string;
  is_visible_on_dashboard: boolean;
  status: DemandStatus;
  assignees: DemandAssignee[];
}

const TABLE = "dashboard_manual_demands";
const ASSIGNEES_TABLE = "dashboard_manual_demand_assignees";

/** Erro de coluna inexistente no PostgREST/Postgres. */
const UNDEFINED_COLUMN = "42703";

/**
 * Alguns ambientes ainda não possuem a coluna `client_name`. Detectamos uma
 * única vez e degradamos a funcionalidade em vez de quebrar a tela inteira.
 */
let clientNameSupported: boolean | null = null;

export function isClientNameSupported(): boolean {
  return clientNameSupported !== false;
}

function demandColumns(withClient: boolean): string {
  const base =
    "id,name,description,desired_date,is_visible_on_dashboard,status,created_by,created_at,updated_at";
  return withClient ? `${base},client_name` : base;
}

/** Soma das estimativas individuais. Nunca persistida. */
export function totalEstimatedHours(assignees: DemandAssignee[]): number {
  return assignees.reduce((acc, a) => acc + (Number(a.estimated_hours) || 0), 0);
}

/** Formata horas decimais como HH:MM (ex.: 16 -> "16:00", 6.5 -> "06:30"). */
export function formatHoursHHMM(hours: number): string {
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const totalMinutes = Math.round(safe * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function fetchManualDemands(): Promise<ManualDemand[]> {
  const run = async (withClient: boolean) =>
    await (supabase as any)
      .from(TABLE)
      .select(`${demandColumns(withClient)},${ASSIGNEES_TABLE}(id,user_id,estimated_hours)`)
      .order("desired_date", { ascending: true });

  let { data, error } = await run(clientNameSupported !== false);

  if (error && error.code === UNDEFINED_COLUMN) {
    clientNameSupported = false;
    ({ data, error } = await run(false));
  } else if (!error) {
    if (clientNameSupported === null) clientNameSupported = true;
  }

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    client_name: row.client_name ?? null,
    desired_date: row.desired_date,
    is_visible_on_dashboard: Boolean(row.is_visible_on_dashboard),
    status: (row.status ?? "Ativa") as DemandStatus,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    assignees: ((row[ASSIGNEES_TABLE] ?? []) as any[]).map((a) => ({
      id: a.id,
      user_id: a.user_id,
      estimated_hours: Number(a.estimated_hours) || 0,
    })),
  }));
}

/** Validação compartilhada entre criação e edição. */
export function validateDemand(input: ManualDemandInput): string | null {
  if (!input.name.trim()) return "Informe o nome da demanda.";
  if (!input.desired_date) return "Informe a data desejada.";
  if (input.assignees.length === 0) return "Adicione ao menos um responsável.";
  const seen = new Set<string>();
  for (const a of input.assignees) {
    if (!a.user_id) return "Selecione o responsável em todas as linhas.";
    if (seen.has(a.user_id)) return "O mesmo responsável não pode ser adicionado duas vezes.";
    seen.add(a.user_id);
    if (!Number.isFinite(a.estimated_hours) || a.estimated_hours <= 0) {
      return "Cada responsável precisa de uma estimativa maior que zero.";
    }
  }
  return null;
}

function demandPayload(input: ManualDemandInput) {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    desired_date: input.desired_date,
    is_visible_on_dashboard: input.is_visible_on_dashboard,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (isClientNameSupported()) payload.client_name = input.client_name?.trim() || null;
  return payload;
}

async function replaceAssignees(demandId: string, assignees: DemandAssignee[]) {
  const { error: delError } = await (supabase as any)
    .from(ASSIGNEES_TABLE)
    .delete()
    .eq("demand_id", demandId);
  if (delError) throw delError;

  if (assignees.length === 0) return;

  const { error } = await (supabase as any).from(ASSIGNEES_TABLE).insert(
    assignees.map((a) => ({
      demand_id: demandId,
      user_id: a.user_id,
      estimated_hours: a.estimated_hours,
    }))
  );
  if (error) throw error;
}

export async function createManualDemand(input: ManualDemandInput): Promise<string> {
  const invalid = validateDemand(input);
  if (invalid) throw new Error(invalid);

  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from(TABLE)
    .insert({ ...demandPayload(input), created_by: session?.user?.id ?? null })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  try {
    await replaceAssignees(id, input.assignees);
  } catch (e) {
    // Evita demandas órfãs sem responsáveis quando a segunda etapa falha.
    await (supabase as any).from(TABLE).delete().eq("id", id);
    throw e;
  }
  return id;
}

export async function updateManualDemand(id: string, input: ManualDemandInput): Promise<void> {
  const invalid = validateDemand(input);
  if (invalid) throw new Error(invalid);

  const { error } = await (supabase as any).from(TABLE).update(demandPayload(input)).eq("id", id);
  if (error) throw error;

  await replaceAssignees(id, input.assignees);
}

export async function setDemandDashboardVisibility(id: string, visible: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from(TABLE)
    .update({ is_visible_on_dashboard: visible, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteManualDemand(id: string): Promise<void> {
  // Remove os responsáveis explicitamente: o relacionamento pode não ter
  // ON DELETE CASCADE configurado no banco.
  const { error: assigneesError } = await (supabase as any)
    .from(ASSIGNEES_TABLE)
    .delete()
    .eq("demand_id", id);
  if (assigneesError) throw assigneesError;

  const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
