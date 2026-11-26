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
  /** Legado: vínculo antigo com dashboard_users. Novas demandas usam assignee_name. */
  user_id?: string | null;
  /** Nome do responsável do Kanban (mesmo nome usado nas filas do Painel Geral). */
  assignee_name: string | null;
  estimated_hours: number;
  /** Fila escolhida manualmente no quadro deste responsável (independente dos demais). */
  lane_id?: string | null;
  /** true quando o responsável moveu o card; false = fila derivada da data desejada. */
  manually_positioned?: boolean;
  /** Clientes marcados POR ESTE responsável (lista compartilhada em `client_names`). */
  client_selections?: string[];
}

/** Nome do responsável: prioriza o responsável do Kanban; cai no usuário legado. */
export function resolveAssigneeName(
  a: DemandAssignee,
  nameById: Map<string, string>,
): string | null {
  const direct = a.assignee_name?.trim();
  if (direct) return direct;
  return a.user_id ? nameById.get(a.user_id) ?? null : null;
}

export interface ManualDemand {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  /** Lista de clientes da demanda, compartilhada por todos os responsáveis. */
  client_names: string[];
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
  /** Opcional: preserva a lista compartilhada ao editar os dados da demanda. */
  client_names?: string[];
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
/** Ambientes sem a migration de posição individual continuam funcionando. */
let assigneeLaneSupported: boolean | null = null;
/** Checklist de clientes (depende da migration de 2026-11-26). */
let demandClientNamesSupported: boolean | null = null;
/** Seleções individuais por responsável (mesma migration). */
let assigneeClientSelectionsSupported: boolean | null = null;

export function isClientNameSupported(): boolean {
  return clientNameSupported !== false;
}

export function isDemandClientChecklistSupported(): boolean {
  return demandClientNamesSupported !== false && assigneeClientSelectionsSupported !== false;
}

/** Normaliza listas de clientes: sem espaços, vazios ou duplicados (case-insensitive). */
export function normalizeClientList(value: unknown): string[] {
  let list: unknown = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
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
  const run = async (withClient: boolean, withLane: boolean) =>
    await (supabase as any)
      .from(TABLE)
      .select(
        `${demandColumns(withClient)},${ASSIGNEES_TABLE}(id,user_id,assignee_name,estimated_hours${
          withLane ? ",lane_id,manually_positioned" : ""
        })`,
      )
      .order("desired_date", { ascending: true });

  let withClient = clientNameSupported !== false;
  let withLane = assigneeLaneSupported !== false;
  let { data, error } = await run(withClient, withLane);

  if (error && error.code === UNDEFINED_COLUMN && withLane) {
    withLane = false;
    ({ data, error } = await run(withClient, withLane));
    if (!error) assigneeLaneSupported = false;
  }
  if (error && error.code === UNDEFINED_COLUMN && withClient) {
    withClient = false;
    ({ data, error } = await run(withClient, withLane));
    if (!error) clientNameSupported = false;
  }
  if (!error) {
    if (clientNameSupported === null) clientNameSupported = withClient;
    if (assigneeLaneSupported === null) assigneeLaneSupported = withLane;
  }

  if (error) throw error;

  // Checklist de clientes: consultas separadas para que a ausência da migration
  // não derrube o carregamento principal das demandas.
  const clientNamesById = new Map<string, string[]>();
  const selectionsByAssigneeId = new Map<string, string[]>();

  if (demandClientNamesSupported !== false) {
    const { data: clientRows, error: clientError } = await (supabase as any)
      .from(TABLE)
      .select("id,client_names");
    if (clientError) {
      if (clientError.code === UNDEFINED_COLUMN) demandClientNamesSupported = false;
      else console.warn("[manual-demands] checklist de clientes indisponível:", clientError.message);
    } else {
      demandClientNamesSupported = true;
      for (const row of (clientRows ?? []) as { id: string; client_names: unknown }[]) {
        clientNamesById.set(row.id, normalizeClientList(row.client_names));
      }
    }
  }

  if (assigneeClientSelectionsSupported !== false) {
    const { data: selectionRows, error: selectionError } = await (supabase as any)
      .from(ASSIGNEES_TABLE)
      .select("id,client_selections");
    if (selectionError) {
      if (selectionError.code === UNDEFINED_COLUMN) assigneeClientSelectionsSupported = false;
      else
        console.warn(
          "[manual-demands] seleções de clientes indisponíveis:",
          selectionError.message,
        );
    } else {
      assigneeClientSelectionsSupported = true;
      for (const row of (selectionRows ?? []) as { id: string; client_selections: unknown }[]) {
        selectionsByAssigneeId.set(row.id, normalizeClientList(row.client_selections));
      }
    }
  }

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    client_name: row.client_name ?? null,
    client_names: clientNamesById.get(row.id) ?? [],
    desired_date: row.desired_date,
    is_visible_on_dashboard: Boolean(row.is_visible_on_dashboard),
    status: (row.status ?? "Ativa") as DemandStatus,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    assignees: ((row[ASSIGNEES_TABLE] ?? []) as any[]).map((a) => ({
      id: a.id,
      user_id: a.user_id ?? null,
      assignee_name: a.assignee_name ?? null,
      estimated_hours: Number(a.estimated_hours) || 0,
      lane_id: a.lane_id ?? null,
      manually_positioned: a.manually_positioned === true,
      client_selections: selectionsByAssigneeId.get(a.id) ?? [],
    })),
  }));
}

const CHECKLIST_MIGRATION_ERROR =
  "O checklist de clientes exige a atualização do banco (migration de 2026-11-26).";

/** Atualiza a lista de clientes compartilhada pela demanda (não toca em marcações). */
export async function updateManualDemandClients(
  demandId: string,
  clients: string[],
): Promise<void> {
  if (demandClientNamesSupported === false) throw new Error(CHECKLIST_MIGRATION_ERROR);
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .update({
      client_names: normalizeClientList(clients),
      updated_at: new Date().toISOString(),
    })
    .eq("id", demandId)
    .select("id");
  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      demandClientNamesSupported = false;
      throw new Error(CHECKLIST_MIGRATION_ERROR);
    }
    throw error;
  }
  demandClientNamesSupported = true;
  if (!data || data.length === 0) throw new Error("Demanda não encontrada.");
}

/**
 * Salva SOMENTE as marcações deste responsável. As linhas dos demais não são
 * lidas nem escritas, portanto marcações paralelas nunca são sobrescritas.
 */
export async function updateDemandAssigneeClientSelections(
  assigneeRowId: string,
  selections: string[],
): Promise<void> {
  if (assigneeClientSelectionsSupported === false) throw new Error(CHECKLIST_MIGRATION_ERROR);
  const { data, error } = await (supabase as any)
    .from(ASSIGNEES_TABLE)
    .update({
      client_selections: normalizeClientList(selections),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assigneeRowId)
    .select("id");
  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      assigneeClientSelectionsSupported = false;
      throw new Error(CHECKLIST_MIGRATION_ERROR);
    }
    throw error;
  }
  assigneeClientSelectionsSupported = true;
  if (!data || data.length === 0) throw new Error("Responsável da demanda não encontrado.");
}

/**
 * Move o card de UM responsável para uma fila do seu próprio quadro.
 * laneId null = "Sem fila". Não afeta os quadros dos outros responsáveis.
 */
export async function moveDemandAssigneeCard(assigneeRowId: string, laneId: string | null) {
  if (assigneeLaneSupported === false) {
    throw new Error(
      "Mover demandas avulsas exige a atualização do banco (migration de posição individual).",
    );
  }
  const { data, error } = await (supabase as any)
    .from(ASSIGNEES_TABLE)
    .update({ lane_id: laneId, manually_positioned: true, updated_at: new Date().toISOString() })
    .eq("id", assigneeRowId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Responsável da demanda não encontrado.");
}

/** Validação compartilhada entre criação e edição. */
export function validateDemand(input: ManualDemandInput): string | null {
  if (!input.name.trim()) return "Informe o nome da demanda.";
  if (!input.desired_date) return "Informe a data desejada.";
  if (input.assignees.length === 0) return "Adicione ao menos um responsável.";
  const seen = new Set<string>();
  for (const a of input.assignees) {
    const key = (a.assignee_name ?? "").trim().toLowerCase();
    if (!key) return "Selecione o responsável em todas as linhas.";
    if (seen.has(key)) return "O mesmo responsável não pode ser adicionado duas vezes.";
    seen.add(key);
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
  // Só envia a lista quando ela foi informada; edições normais da demanda não
  // podem apagar as marcações feitas no modal dos cards.
  if (demandClientNamesSupported === true && input.client_names !== undefined) {
    payload.client_names = normalizeClientList(input.client_names);
  }
  return payload;
}

async function replaceAssignees(demandId: string, assignees: DemandAssignee[]) {
  // A edição dos dados da demanda recria as linhas de responsáveis. Guardamos
  // as seleções individuais atuais por nome para não perdê-las nesse processo.
  const previousSelections = new Map<string, string[]>();
  if (assigneeClientSelectionsSupported === true) {
    const { data: previousRows } = await (supabase as any)
      .from(ASSIGNEES_TABLE)
      .select("assignee_name,client_selections")
      .eq("demand_id", demandId);
    for (const row of (previousRows ?? []) as {
      assignee_name: string | null;
      client_selections: unknown;
    }[]) {
      const key = (row.assignee_name ?? "").trim().toLocaleLowerCase("pt-BR");
      if (key) previousSelections.set(key, normalizeClientList(row.client_selections));
    }
  }

  const { error: delError } = await (supabase as any)
    .from(ASSIGNEES_TABLE)
    .delete()
    .eq("demand_id", demandId);
  if (delError) throw delError;

  if (assignees.length === 0) return;

  const { error } = await (supabase as any).from(ASSIGNEES_TABLE).insert(
    assignees.map((a) => {
      const name = a.assignee_name?.trim() ?? null;
      const key = (name ?? "").toLocaleLowerCase("pt-BR");
      const selections =
        a.client_selections !== undefined
          ? normalizeClientList(a.client_selections)
          : previousSelections.get(key) ?? [];
      return {
        demand_id: demandId,
        user_id: null,
        assignee_name: name,
        estimated_hours: a.estimated_hours,
        // Preserva a posição individual ao editar a demanda.
        ...(assigneeLaneSupported === true
          ? { lane_id: a.lane_id ?? null, manually_positioned: a.manually_positioned === true }
          : {}),
        ...(assigneeClientSelectionsSupported === true ? { client_selections: selections } : {}),
      };
    })
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
