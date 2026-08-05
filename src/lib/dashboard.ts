import { supabase } from "@/integrations/supabase/client";

export const STATUSES = [
  "a iniciar",
  "em andamento",
  "concluído",
  "em revisão",
  "em correção",
  "aguardando informação",
] as const;

export type CardStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<CardStatus, string> = {
  "a iniciar": "A Iniciar",
  "em andamento": "Em Andamento",
  "concluído": "Concluído",
  "em revisão": "Em Revisão",
  "em correção": "Em Correção",
  "aguardando informação": "Aguardando Informação",
};

// Tailwind classes for full-card background by status
export const STATUS_CARD_CLASS: Record<CardStatus, string> = {
  "a iniciar":
    "bg-white border-slate-200 text-slate-900 dark:bg-[#2A2A2A] dark:border-neutral-700 dark:text-neutral-100",
  "em andamento":
    "bg-yellow-100 border-yellow-300 text-yellow-950 dark:bg-[#3A3200] dark:border-yellow-900/70 dark:text-yellow-50",
  "concluído":
    "bg-green-100 border-green-300 text-green-950 dark:bg-[#17351F] dark:border-green-900/70 dark:text-green-50",
  "em revisão":
    "bg-purple-100 border-purple-300 text-purple-950 dark:bg-[#2E1A47] dark:border-purple-900/70 dark:text-purple-50",
  "em correção":
    "bg-orange-100 border-orange-300 text-orange-950 dark:bg-[#3A2208] dark:border-orange-900/70 dark:text-orange-50",
  "aguardando informação":
    "bg-pink-100 border-pink-300 text-pink-950 dark:bg-[#3A1F2D] dark:border-pink-900/70 dark:text-pink-50",
};

export const STATUS_DOT_CLASS: Record<CardStatus, string> = {
  "a iniciar": "bg-slate-400",
  "em andamento": "bg-yellow-500",
  "concluído": "bg-green-500",
  "em revisão": "bg-purple-500",
  "em correção": "bg-orange-500",
  "aguardando informação": "bg-pink-500",
};

export function normalizeStatus(s: string | null | undefined): CardStatus {
  const v = (s ?? "").toLowerCase().trim();
  return (STATUSES as readonly string[]).includes(v) ? (v as CardStatus) : "a iniciar";
}

export type DashboardProject = {
  runrunit_project_id: number;
  project_name: string;
  client_name: string | null;
  project_group_name: string | null;
  assignee_name: string | null;
  team_name: string | null;
  last_synced_at: string | null;
  created_at_runrunit: string | null;
  desired_delivery_date: string | null;
  is_open: boolean | null;
  card_id: string | null;
  lane_id: string | null;
  status: string | null;
  position: number | null;
};

export type Lane = {
  id: string;
  assignee_name: string;
  title: string;
  position: number;
};

export type CalculationDetails = unknown;

export type ProjectCardRow = {
  id: string;
  runrunit_project_id: number;
  assignee_name: string;
  lane_id: string | null;
  status: string | null;
  position: number;
  internal_note: string | null;
  review_status: string | null;
  review_requested_by: string | null;
  review_requested_to: string | null;
  correction_note: string | null;
  manually_positioned: boolean | null;
  total_tasks?: number | null;
  total_estimated_hours?: number | null;
  calculation_details?: CalculationDetails | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

/**
 * Deriva a origem predominante da estimativa a partir de `calculation_details`.
 * Aceita array de itens ou objeto com contagens; retorna null quando indeterminado.
 */
export function estimateSourceLabel(details: unknown): string | null {
  if (!details) return null;
  let resp = 0;
  let geral = 0;
  const bump = (v: unknown, weight = 1) => {
    const s = String(v ?? "").toLowerCase();
    if (s.includes("responsavel_tipo") || s.includes("responsável_tipo")) resp += weight;
    else if (s.includes("tipo_geral")) geral += weight;
  };
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        bump(o.source ?? o.origem ?? o.fonte ?? o.basis ?? o.tipo);
      } else bump(item);
    }
  } else if (typeof details === "object") {
    const o = details as Record<string, unknown>;
    if (Array.isArray(o.tasks)) return estimateSourceLabel(o.tasks);
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number") bump(k, v);
      else bump(v);
    }
  } else {
    bump(details);
  }
  if (resp === 0 && geral === 0) return null;
  return resp >= geral
    ? "Baseado no histórico do responsável"
    : "Baseado no histórico geral";
}


export async function fetchDashboardProjects(): Promise<DashboardProject[]> {
  const pageSize = 1000;
  const all: DashboardProject[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("v_dashboard_projects")
      .select("*")
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as DashboardProject[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  // Defensive: ignore closed projects, mesmo que cheguem na lista
  // Regra: somente projetos abertos e com data desejada definida
  return all.filter((p) => p.is_open !== false && !!p.desired_delivery_date);
}

// ---------- Monthly lane helpers ----------
const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/**
 * Converte o título de uma fila (ex: "Agosto/2026") para o primeiro dia do mês em ISO (2026-08-01).
 * Útil para salvar na coluna reference_month (tipo date).
 */
export function monthlyTitleToDateISO(title: string): string | null {
  const parts = title.split("/");
  if (parts.length !== 2) return null;
  const monthName = parts[0].trim();
  const year = parseInt(parts[1].trim(), 10);
  if (isNaN(year)) return null;

  const monthIndex = MONTH_NAMES_PT.findIndex(
    (m) => m.toLowerCase() === monthName.toLowerCase()
  );
  if (monthIndex === -1) return null;

  // monthIndex is 0-based, ISO month should be 1-based and padded
  const monthStr = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${monthStr}-01`;
}


/**
 * Converte uma data ISO (YYYY-MM-DD) no padrão "Mês/AAAA" em pt-BR.
 * Ex.: 2026-06-19 → "Junho/2026".
 */
export function monthlyLaneTitle(dateISO: string): string {
  // Trabalha em UTC para evitar deslocamento por fuso quando a string é YYYY-MM-DD
  const d = new Date(dateISO.length <= 10 ? `${dateISO}T00:00:00Z` : dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTH_NAMES_PT[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}

export function findLaneByTitle(
  lanes: Lane[],
  assigneeName: string,
  titles: string[]
): Lane | null {
  const set = lanes.filter((l) => l.assignee_name === assigneeName);
  for (const t of titles) {
    const m = set.find((l) => l.title.trim().toLowerCase() === t.toLowerCase());
    if (m) return m;
  }
  return null;
}

export async function fetchLanes(): Promise<Lane[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_lanes")
    .select("id,assignee_name,title,position")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Lane[];
}

export async function fetchCards(): Promise<ProjectCardRow[]> {
  const pageSize = 1000;
  const all: ProjectCardRow[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("dashboard_cards_with_estimates")
      .select(
        "id,runrunit_project_id,assignee_name,lane_id,status,position,internal_note,review_status,review_requested_by,review_requested_to,correction_note,manually_positioned,total_tasks,total_estimated_hours,calculation_details,updated_by,updated_at"
      )
      .range(from, to);

    if (error) throw error;
    const rows = (data ?? []) as ProjectCardRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function createLane(assignee_name: string, title: string, position: number): Promise<Lane> {
  const { data, error } = await (supabase as any)
    .from("dashboard_lanes")
    .insert({ assignee_name, title, position })
    .select("id,assignee_name,title,position")
    .single();
  if (error) throw error;
  return data as Lane;
}

export async function updateLane(id: string, patch: Partial<Pick<Lane, "title" | "position">>) {
  const { error } = await (supabase as any)
    .from("dashboard_lanes")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLane(id: string) {
  // detach cards first so we don't lose them
  await (supabase as any)
    .from("dashboard_project_cards")
    .update({ lane_id: null })
    .eq("lane_id", id);
  const { error } = await (supabase as any)
    .from("dashboard_lanes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function upsertCard(input: {
  runrunit_project_id: number;
  assignee_name: string;
  lane_id?: string | null;
  status?: string | null;
  position?: number;
  internal_note?: string | null;
  review_status?: string | null;
  review_requested_by?: string | null;
  review_requested_to?: string | null;
  correction_note?: string | null;
  manually_positioned?: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
}): Promise<ProjectCardRow> {
  // Try to find existing
  const { data: existing, error: e1 } = await (supabase as any)
    .from("dashboard_project_cards")
    .select(
      "id,runrunit_project_id,assignee_name,lane_id,status,position,internal_note,review_status,review_requested_by,review_requested_to,correction_note,updated_by,updated_at"
    )
    .eq("runrunit_project_id", input.runrunit_project_id)
    .eq("assignee_name", input.assignee_name)
    .maybeSingle();
  if (e1) throw e1;

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (input.lane_id !== undefined) patch.lane_id = input.lane_id;
    if (input.status !== undefined) patch.status = input.status;
    if (input.position !== undefined) patch.position = input.position;
    if (input.internal_note !== undefined) patch.internal_note = input.internal_note;
    if (input.review_status !== undefined) patch.review_status = input.review_status;
    if (input.review_requested_by !== undefined) patch.review_requested_by = input.review_requested_by;
    if (input.review_requested_to !== undefined) patch.review_requested_to = input.review_requested_to;
    if (input.correction_note !== undefined) patch.correction_note = input.correction_note;
    if (input.updated_by !== undefined) patch.updated_by = input.updated_by;
    if (input.manually_positioned !== undefined) {
      patch.manually_positioned = input.manually_positioned;
      patch.manually_positioned_at = input.manually_positioned ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) return existing as ProjectCardRow;
    patch.updated_at = input.updated_at || new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from("dashboard_project_cards")
      .update(patch)
      .eq("id", (existing as any).id)
      .select(
        "id,runrunit_project_id,assignee_name,lane_id,status,position,internal_note,review_status,review_requested_by,review_requested_to,correction_note,updated_by,updated_at"
      )
      .single();
    if (error) throw error;
    return data as ProjectCardRow;
  }

  const { data, error } = await (supabase as any)
    .from("dashboard_project_cards")
    .insert({
      runrunit_project_id: input.runrunit_project_id,
      assignee_name: input.assignee_name,
      lane_id: input.lane_id ?? null,
      status: input.status ?? "a iniciar",
      position: input.position ?? 0,
      internal_note: input.internal_note ?? null,
      review_status: input.review_status ?? "não enviado",
      review_requested_by: input.review_requested_by ?? null,
      review_requested_to: input.review_requested_to ?? null,
      correction_note: input.correction_note ?? null,
      manually_positioned: input.manually_positioned ?? false,
      manually_positioned_at: input.manually_positioned ? new Date().toISOString() : null,
      updated_by: input.updated_by ?? null,
      updated_at: input.updated_at ?? new Date().toISOString(),
    })
    .select(
      "id,runrunit_project_id,assignee_name,lane_id,status,position,internal_note,review_status,review_requested_by,review_requested_to,correction_note,updated_by,updated_at"
    )
    .single();
  if (error) throw error;
  return data as ProjectCardRow;
}

export type DashboardUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  is_active: boolean | null;
  auth_user_id: string | null;
  access_level: "comum" | "lider" | "administrador" | null;
  created_at: string | null;
};

export async function fetchDashboardUsers(): Promise<DashboardUser[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_users")
    .select("id,email,name,role,is_active,auth_user_id,access_level,created_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DashboardUser[];
}

export async function updateUserAccessLevel(
  id: string,
  level: "comum" | "lider" | "administrador"
) {
  const { error } = await (supabase as any)
    .from("dashboard_users")
    .update({ access_level: level, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateUserActive(id: string, is_active: boolean) {
  const { error } = await (supabase as any)
    .from("dashboard_users")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Monthly lane bootstrap ----------
/**
 * Meses a garantir por padrão no quadro de cada responsável (Jul → Dez 2026).
 */
export const DEFAULT_MONTHLY_LANE_TITLES = [
  "Julho/2026",
  "Agosto/2026",
  "Setembro/2026",
  "Outubro/2026",
  "Novembro/2026",
  "Dezembro/2026",
] as const;

// Regex para detectar títulos no formato "Mês/AAAA" (pt-BR)
const MONTHLY_TITLE_REGEX =
  /^(Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\/\d{4}$/i;

export function isMonthlyLaneTitle(title: string): boolean {
  return MONTHLY_TITLE_REGEX.test(title.trim());
}

// Guard em memória (por sessão) para evitar múltiplas chamadas de bootstrap
// para o mesmo responsável no mesmo carregamento da página.
const bootstrappedAssignees = new Set<string>();

/**
 * Garante que as filas mensais padrão existam no quadro do responsável.
 * Não duplica filas — compara por assignee_name + title (case-insensitive)
 * e tolera conflitos com o índice único `unique_dashboard_lane_assignee_title`.
 * Retorna true se alguma fila foi criada.
 */
export async function ensureDefaultMonthlyLanes(
  assignee_name: string,
  existingLanes: Lane[]
): Promise<boolean> {
  const key = assignee_name.trim().toLowerCase();
  if (bootstrappedAssignees.has(key)) return false;
  bootstrappedAssignees.add(key);

  const already = new Set(
    existingLanes
      .filter((l) => l.assignee_name === assignee_name)
      .map((l) => l.title.trim().toLowerCase())
  );
  const missing = DEFAULT_MONTHLY_LANE_TITLES.filter(
    (t) => !already.has(t.toLowerCase())
  );
  if (missing.length === 0) return false;
  const basePosition = existingLanes
    .filter((l) => l.assignee_name === assignee_name)
    .reduce((max, l) => Math.max(max, l.position ?? 0), -1);
  // Inserir uma a uma e ignorar violação do índice único (23505). Isso
  // evita que corridas entre abas/refreshes gerem filas duplicadas.
  let created = false;
  for (let idx = 0; idx < missing.length; idx++) {
    const row = {
      assignee_name,
      title: missing[idx],
      position: basePosition + 1 + idx,
    };
    const { error } = await (supabase as any).from("dashboard_lanes").insert(row);
    if (!error) {
      created = true;
      continue;
    }
    // Postgres unique_violation → fila já existe, ignora e segue.
    const code = (error as { code?: string }).code;
    if (code === "23505") continue;
    // Outros erros: libera o guard e propaga
    bootstrappedAssignees.delete(key);
    throw error;
  }
  return created;
}

/**
 * Detecta duplicatas de filas mensais no mesmo responsável (mesmo título
 * ignorando caixa e espaços) e as consolida: mantém a de menor posição,
 * migra os cards das duplicatas para a canônica e apaga as extras.
 * Retorna true se alguma limpeza foi feita.
 */
export async function dedupeMonthlyLanes(lanes: Lane[]): Promise<boolean> {
  const byKey = new Map<string, Lane[]>();
  for (const l of lanes) {
    if (!isMonthlyLaneTitle(l.title)) continue;
    const k = `${l.assignee_name}::${l.title.trim().toLowerCase()}`;
    const arr = byKey.get(k) ?? [];
    arr.push(l);
    byKey.set(k, arr);
  }
  let changed = false;
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const keep = group[0];
    const drop = group.slice(1);
    for (const d of drop) {
      // Move cards da fila duplicada para a canônica
      await (supabase as any)
        .from("dashboard_project_cards")
        .update({ lane_id: keep.id })
        .eq("lane_id", d.id);
      // Move revisões da fila duplicada, se houver
      await (supabase as any)
        .from("dashboard_reviews")
        .update({ lane_id: keep.id })
        .eq("lane_id", d.id);
      const { error } = await (supabase as any)
        .from("dashboard_lanes")
        .delete()
        .eq("id", d.id);
      if (!error) changed = true;
    }
  }
  return changed;
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<ProjectCardRow, "lane_id" | "status" | "position" | "updated_by" | "updated_at">>
) {
  const fullPatch = { ...patch, updated_at: patch.updated_at || new Date().toISOString() };
  const { error } = await (supabase as any)
    .from("dashboard_project_cards")
    .update(fullPatch)
    .eq("id", id);
  if (error) throw error;
}

export async function bulkUpdateCardPositions(updates: { id: string; lane_id: string | null; position: number; updated_by?: string | null }[]) {
  // Sequential updates to keep RLS happy without RPC
  const now = new Date().toISOString();
  for (const u of updates) {
    const { error } = await (supabase as any)
      .from("dashboard_project_cards")
      .update({
        lane_id: u.lane_id,
        position: u.position,
        manually_positioned: true,
        manually_positioned_at: now,
        updated_by: u.updated_by,
        updated_at: now,
      })
      .eq("id", u.id);
    if (error) throw error;
  }
}

// ---------- Reviews ----------
export type ReviewRow = {
  id: string;
  runrunit_project_id: number;
  source_card_id: string | null;
  original_assignee_name: string;
  reviewer_name: string;
  requested_by_name: string;
  review_status: string;
  correction_note: string | null;
  lane_id: string | null;
  position: number;
  finished_at: string | null;
};

export async function fetchReviews(): Promise<ReviewRow[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_reviews")
    .select(
      "id,runrunit_project_id,source_card_id,original_assignee_name,reviewer_name,requested_by_name,review_status,correction_note,lane_id,position,finished_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export async function createReview(input: {
  runrunit_project_id: number;
  source_card_id: string | null;
  original_assignee_name: string;
  reviewer_name: string;
  requested_by_name: string;
  lane_id?: string | null;
  position?: number;
}): Promise<ReviewRow> {
  const { data, error } = await (supabase as any)
    .from("dashboard_reviews")
    .insert({
      runrunit_project_id: input.runrunit_project_id,
      source_card_id: input.source_card_id,
      original_assignee_name: input.original_assignee_name,
      reviewer_name: input.reviewer_name,
      requested_by_name: input.requested_by_name,
      review_status: "aguardando revisão",
      lane_id: input.lane_id ?? null,
      position: input.position ?? 0,
    })
    .select(
      "id,runrunit_project_id,source_card_id,original_assignee_name,reviewer_name,requested_by_name,review_status,correction_note,lane_id,position,finished_at"
    )
    .single();
  if (error) throw error;
  return data as ReviewRow;
}

export async function updateReview(
  id: string,
  patch: Partial<Pick<ReviewRow, "review_status" | "correction_note" | "finished_at" | "lane_id" | "position">>
) {
  const { error } = await (supabase as any)
    .from("dashboard_reviews")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Planning ----------
export const PLANNING_STATUSES = ["em andamento", "em revisão", "concluído"] as const;
export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

export const PLANNING_STATUS_LABEL: Record<PlanningStatus, string> = {
  "em andamento": "Em Andamento",
  "em revisão": "Em Revisão",
  "concluído": "Concluído",
};

export const PLANNING_STATUS_CLASS: Record<PlanningStatus, string> = {
  "em andamento": "bg-yellow-50 border-yellow-300 border-l-4 border-l-yellow-500",
  "em revisão": "bg-purple-50 border-purple-300 border-l-4 border-l-purple-500",
  "concluído": "bg-green-50 border-green-300 border-l-4 border-l-green-500",
};

export const PLANNING_STATUS_DOT: Record<PlanningStatus, string> = {
  "em andamento": "bg-yellow-500",
  "em revisão": "bg-purple-500",
  "concluído": "bg-green-500",
};

export function normalizePlanningStatus(s: string | null | undefined): PlanningStatus {
  const v = (s ?? "").toLowerCase().trim();
  return (PLANNING_STATUSES as readonly string[]).includes(v) ? (v as PlanningStatus) : "em andamento";
}

export type PlanningProject = {
  runrunit_project_id: number;
  project_name: string;
  client_name: string | null;
  project_group_name: string | null;
  created_at_runrunit: string | null;
  last_synced_at: string | null;
  is_tracking_enabled: boolean | null;
  planning_id: string | null;
  planning_date: string | null; // YYYY-MM-DD
  planning_status: string | null;
  detail: string | null;
  position: number | null;
  planning_updated_at: string | null;
  desired_delivery_date?: string | null;
};

export async function fetchPlanningProjects(): Promise<PlanningProject[]> {
  const pageSize = 1000;
  const all: PlanningProject[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await (supabase as any)
      .from("v_planning_projects")
      .select("*")
      .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as PlanningProject[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  // Restringe a projetos abertos, exibidos e com data desejada preenchida.
  // Também carrega desired_delivery_date para uso como data efetiva do
  // Calendário (planning_date tem prioridade quando existir).
  const { data: validRows, error: vErr } = await (supabase as any)
    .from("runrunit_projects")
    .select("runrunit_project_id,desired_delivery_date")
    .eq("is_open", true)
    .eq("is_tracking_enabled", true)
    .not("desired_delivery_date", "is", null);
  if (vErr) throw vErr;
  const validMap = new Map<number, string>();
  for (const r of (validRows ?? []) as {
    runrunit_project_id: number;
    desired_delivery_date: string | null;
  }[]) {
    if (r.desired_delivery_date) validMap.set(r.runrunit_project_id, r.desired_delivery_date);
  }
  return all
    .filter((p) => validMap.has(p.runrunit_project_id))
    .map((p) => ({ ...p, desired_delivery_date: validMap.get(p.runrunit_project_id) ?? null }));
}

/**
 * Data efetiva do Calendário: planning_date manual tem prioridade;
 * na ausência dela, usa desired_delivery_date do Runrun.it.
 */
export function planningEffectiveDate(p: PlanningProject): string | null {
  return p.planning_date ?? p.desired_delivery_date ?? null;
}

export async function clearPlanningDate(planning_id: string) {
  const { error } = await (supabase as any)
    .from("dashboard_project_planning")
    .update({ planning_date: null, updated_at: new Date().toISOString() })
    .eq("id", planning_id);
  if (error) throw error;
}

export async function upsertPlanning(input: {
  planning_id?: string | null;
  runrunit_project_id: number;
  planning_date?: string | null;
  planning_status?: string | null;
  detail?: string | null;
  position?: number;
}): Promise<{ id: string }> {
  if (input.planning_id) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.planning_date !== undefined) patch.planning_date = input.planning_date;
    if (input.planning_status !== undefined) patch.planning_status = input.planning_status;
    if (input.detail !== undefined) patch.detail = input.detail;
    if (input.position !== undefined) patch.position = input.position;
    const { data, error } = await (supabase as any)
      .from("dashboard_project_planning")
      .update(patch)
      .eq("id", input.planning_id)
      .select("id")
      .single();
    if (error) throw error;
    return data as { id: string };
  }
  // try find existing row for this project (one per project)
  const { data: existing } = await (supabase as any)
    .from("dashboard_project_planning")
    .select("id")
    .eq("runrunit_project_id", input.runrunit_project_id)
    .maybeSingle();
  if (existing?.id) {
    return upsertPlanning({ ...input, planning_id: existing.id });
  }
  const { data, error } = await (supabase as any)
    .from("dashboard_project_planning")
    .insert({
      runrunit_project_id: input.runrunit_project_id,
      planning_date: input.planning_date ?? null,
      planning_status: input.planning_status ?? "em andamento",
      detail: input.detail ?? null,
      position: input.position ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}