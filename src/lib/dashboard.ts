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

/**
 * Normaliza nomes somente para comparação no cliente.
 * O texto original continua sendo o valor persistido no banco.
 */
export function normalizeAssigneeName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function sameAssigneeName(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeAssigneeName(left);
  const normalizedRight = normalizeAssigneeName(right);
  return normalizedLeft !== "" && normalizedLeft === normalizedRight;
}

export function laneBelongsToAssignee(
  lane: Pick<Lane, "assignee_name"> | null | undefined,
  assigneeName: string | null | undefined,
): boolean {
  return !!lane && sameAssigneeName(lane.assignee_name, assigneeName);
}

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
  is_tec: boolean;
  is_geo: boolean;
  /** Estimativa calculada automaticamente (sincronização), preservada como referência. */
  auto_estimated_hours?: number | null;
  /** Ajuste manual; quando preenchido, substitui a estimativa automática. */
  manual_estimated_hours?: number | null;
};

export function filterByAssignee<T extends { assignee_name: string | null }>(
  rows: T[],
  assigneeName: string | null | undefined,
): T[] {
  return rows.filter((row) => sameAssigneeName(row.assignee_name, assigneeName));
}

export function resolveCardLane(
  card: { lane_id: string | null; assignee_name: string | null },
  lanes: Lane[],
  assigneeName: string,
): Lane | null {
  if (!sameAssigneeName(card.assignee_name, assigneeName) || !card.lane_id) return null;
  const lane = lanes.find((candidate) => candidate.id === card.lane_id);
  return laneBelongsToAssignee(lane, assigneeName) ? lane : null;
}

/** Horas efetivas do card: ajuste manual tem prioridade sobre a automática. */
export function effectiveEstimatedHours(
  auto: number | null | undefined,
  manual: number | null | undefined,
): number | null {
  if (manual != null && Number.isFinite(Number(manual))) return Number(manual);
  if (auto != null && Number.isFinite(Number(auto))) return Number(auto);
  return null;
}

/**
 * Converte o texto digitado (aceita vírgula ou ponto) em horas.
 * Vazio => null (remove o ajuste). Retorna undefined quando inválido.
 */
export function parseManualHoursInput(raw: string): number | null | undefined {
  const text = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (text === "") return null;
  let value: number;
  // Formato relógio: "1:45", "01:30", "1h45", "1h", "45min"
  const clock = /^(\d+)(?::|h)(\d{1,2})?(?:m|min)?$/.exec(text);
  const onlyMin = /^(\d+)(?:m|min)$/.exec(text);
  if (clock) {
    const mins = clock[2] ? Number(clock[2]) : 0;
    if (mins > 59) return undefined;
    value = Number(clock[1]) + mins / 60;
  } else if (onlyMin) {
    value = Number(onlyMin[1]) / 60;
  } else {
    const dec = text.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(dec)) return undefined;
    value = Number(dec);
  }
  if (!Number.isFinite(value) || value < 0 || value > 10000) return undefined;
  return Math.round(value * 100) / 100;
}

/** Converte horas decimais para texto de relógio editável ("1:45"). */
export function hoursToClockInput(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

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
  const set = lanes.filter((l) => laneBelongsToAssignee(l, assigneeName));
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

export async function fetchCards(
  options: { onComplementaryError?: (error: unknown) => void } = {},
): Promise<ProjectCardRow[]> {
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
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    const rows = (data ?? []) as ProjectCardRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  // Lotes pequenos: `.in("id", ids)` vai na URL; 1000 UUIDs (~37 KB) excedem o
  // limite do gateway e retornam HTTP 400 "Bad Request".
  const ID_CHUNK = 150;
  const flagsById = new Map<
    string,
    { is_tec: boolean; is_geo: boolean; manual_estimated_hours: number | null }
  >();
  let withManual = true;
  for (let from = 0; from < all.length; from += ID_CHUNK) {
    const ids = all.slice(from, from + ID_CHUNK).map((card) => card.id);
    let { data, error } = await (supabase as any)
      .from("dashboard_project_cards")
      .select(withManual ? "id,is_tec,is_geo,manual_estimated_hours" : "id,is_tec,is_geo")
      .in("id", ids);
    // Coluna do ajuste manual ainda não criada no banco: segue sem ela.
    if (error && withManual && isMissingColumn(error, "manual_estimated_hours")) {
      withManual = false;
      ({ data, error } = await (supabase as any)
        .from("dashboard_project_cards")
        .select("id,is_tec,is_geo")
        .in("id", ids));
    }
    if (error) {
      const value = error as { code?: string; message?: string; details?: string };
      options.onComplementaryError?.(error);
      console.error("[dashboard] fetchCards complementary flags query failed", {
        code: value.code ?? null,
        message: value.message ?? null,
        details: value.details ?? null,
        withManual,
        cardCount: all.length,
      });
      break;
    }
    for (const row of (data ?? []) as any[])
      flagsById.set(row.id, {
        is_tec: row.is_tec,
        is_geo: row.is_geo,
        manual_estimated_hours:
          row.manual_estimated_hours == null ? null : Number(row.manual_estimated_hours),
      });
  }
  return all.map((card) => {
    const flags = flagsById.get(card.id);
    const manual = flags?.manual_estimated_hours ?? null;
    return {
      ...card,
      is_tec: flags?.is_tec ?? false,
      is_geo: flags?.is_geo ?? false,
      auto_estimated_hours: card.total_estimated_hours ?? null,
      manual_estimated_hours: manual,
      total_estimated_hours: effectiveEstimatedHours(card.total_estimated_hours, manual),
    };
  });
}

function isMissingColumn(error: unknown, column: string): boolean {
  const value = error as { code?: string; message?: string; details?: string };
  const message = `${value?.message ?? ""} ${value?.details ?? ""}`.toLowerCase();
  return (value?.code === "42703" || value?.code === "PGRST204" || message.includes("does not exist") || message.includes("schema cache")) && message.includes(column);
}

/** Salva (ou remove, com null) o ajuste manual de horas de um card. */
export async function saveManualEstimate(
  id: string,
  hours: number | null,
  updated_by?: string | null,
): Promise<number | null> {
  const { data, error } = await (supabase as any)
    .from("dashboard_project_cards")
    .update({ manual_estimated_hours: hours, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,manual_estimated_hours")
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error, "manual_estimated_hours"))
      throw new Error("O campo de ajuste manual ainda não foi criado no banco de dados.");
    throw error;
  }
  if (!data) throw new Error("O card não foi atualizado. Verifique suas permissões e tente novamente.");
  return data.manual_estimated_hours == null ? null : Number(data.manual_estimated_hours);
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
  // Move os cards e revisões da fila para "Sem fila" (lane_id = null) antes
  // de excluir, para não perder nada nem violar chaves estrangeiras.
  const { error: cardsErr } = await (supabase as any)
    .from("dashboard_project_cards")
    .update({ lane_id: null })
    .eq("lane_id", id);
  if (cardsErr) throw cardsErr;
  const { error: reviewsErr } = await (supabase as any)
    .from("dashboard_reviews")
    .update({ lane_id: null })
    .eq("lane_id", id);
  if (reviewsErr) throw reviewsErr;
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
  is_tec?: boolean;
  is_geo?: boolean;
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
    if (input.is_tec !== undefined) patch.is_tec = input.is_tec;
    if (input.is_geo !== undefined) patch.is_geo = input.is_geo;
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
    return {
      ...(data as ProjectCardRow),
      is_tec: (data as any).is_tec ?? false,
      is_geo: (data as any).is_geo ?? false,
    };
  }

  const insertPayload: Record<string, unknown> = {
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
  };
  if (input.is_tec !== undefined) insertPayload.is_tec = input.is_tec;
  if (input.is_geo !== undefined) insertPayload.is_geo = input.is_geo;
  const { data, error } = await (supabase as any)
    .from("dashboard_project_cards")
    .insert(insertPayload)
    .select(
      "id,runrunit_project_id,assignee_name,lane_id,status,position,internal_note,review_status,review_requested_by,review_requested_to,correction_note,updated_by,updated_at"
    )
    .single();
  if (error) throw error;
  return {
    ...(data as ProjectCardRow),
    is_tec: (data as any).is_tec ?? false,
    is_geo: (data as any).is_geo ?? false,
  };
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
  const key = normalizeAssigneeName(assignee_name);
  if (bootstrappedAssignees.has(key)) return false;
  bootstrappedAssignees.add(key);

  // Só cria os meses padrão em quadros novos (sem nenhuma fila). Se o quadro
  // já tem filas, respeita exclusões feitas pelo usuário e não recria nada.
  const own = existingLanes.filter((l) => sameAssigneeName(l.assignee_name, assignee_name));
  if (own.length > 0) return false;
  const missing = [...DEFAULT_MONTHLY_LANE_TITLES];
  const basePosition = existingLanes
    .filter((l) => sameAssigneeName(l.assignee_name, assignee_name))
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
    const k = `${normalizeAssigneeName(l.assignee_name)}::${l.title.trim().toLowerCase()}`;
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
  patch: Partial<Pick<ProjectCardRow, "lane_id" | "status" | "position" | "updated_by" | "updated_at" | "is_tec" | "is_geo">>
) {
  const fullPatch = { ...patch, updated_at: patch.updated_at || new Date().toISOString() };
  const { data, error } = await (supabase as any)
    .from("dashboard_project_cards")
    .update(fullPatch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("O card não foi atualizado. Verifique suas permissões e tente novamente.");
}

export type CardPositionUpdate = {
  id: string | null;
  runrunit_project_id: number;
  assignee_name: string;
  lane_id: string | null;
  position: number;
  updated_by?: string | null;
  /**
   * Somente o card efetivamente arrastado pelo usuário deve receber `true`.
   * Vizinhos reindexados omitem o campo e mantêm o valor atual no banco.
   */
  manually_positioned?: boolean;
};

/** Patch gravado para um update de posição (exportado para teste). */
export function positionPatch(u: CardPositionUpdate, now: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    lane_id: u.lane_id,
    position: u.position,
    updated_by: u.updated_by ?? null,
    updated_at: now,
  };
  if (u.manually_positioned === true) {
    patch.manually_positioned = true;
    patch.manually_positioned_at = now;
  }
  return patch;
}

export type BulkPositionResult = {
  failed: number;
  /** Mensagens reais de erro, uma por card que falhou. */
  errors: { runrunit_project_id: number; message: string }[];
  /** Valores lidos de volta da tabela física após a gravação. */
  confirmed: Map<number, { id: string; lane_id: string | null; position: number }>;
};

/**
 * Grava fila/posição dos cards na tabela física `dashboard_project_cards` e
 * CONFIRMA cada gravação lendo de volta a linha afetada. Uma gravação só conta
 * como sucesso quando o `lane_id` devolvido é exatamente o solicitado.
 *
 * - Update por UUID; se nenhuma linha física corresponder (ID vindo da view),
 *   grava pela chave natural (projeto + responsável) via `upsertCard`.
 * - Erros do banco (RLS, coluna ausente etc.) NÃO caem em fallback silencioso:
 *   são registrados com a mensagem original.
 */
export async function bulkUpdateCardPositions(
  updates: CardPositionUpdate[],
): Promise<BulkPositionResult> {
  const now = new Date().toISOString();
  const CHUNK = 8;
  const result: BulkPositionResult = { failed: 0, errors: [], confirmed: new Map() };

  const fail = (u: CardPositionUpdate, message: string) => {
    result.failed++;
    result.errors.push({ runrunit_project_id: u.runrunit_project_id, message });
  };

  const updateOne = async (u: CardPositionUpdate) => {
    try {
      let row: { id: string; lane_id: string | null; position: number } | null = null;
      if (u.id) {
        const { data, error } = await (supabase as any)
          .from("dashboard_project_cards")
          .update(positionPatch(u, now))
          .eq("id", u.id)
          .select("id,lane_id,position");
        if (error) throw new Error(error.message || "erro desconhecido ao gravar");
        if (Array.isArray(data) && data.length > 0) row = data[0];
      }
      if (!row) {
        const saved = await upsertCard({
          runrunit_project_id: u.runrunit_project_id,
          assignee_name: u.assignee_name,
          lane_id: u.lane_id,
          position: u.position,
          ...(u.manually_positioned === true ? { manually_positioned: true } : {}),
          updated_by: u.updated_by ?? null,
        });
        row = { id: saved.id, lane_id: saved.lane_id ?? null, position: saved.position };
      }
      if ((row.lane_id ?? null) !== (u.lane_id ?? null)) {
        fail(u, "o banco não confirmou a nova fila (valor gravado diferente do solicitado).");
        return;
      }
      result.confirmed.set(u.runrunit_project_id, row);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      fail(u, message || "erro desconhecido ao gravar");
    }
  };

  for (let i = 0; i < updates.length; i += CHUNK) {
    await Promise.all(updates.slice(i, i + CHUNK).map(updateOne));
  }
  return result;
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
  project_sub_group_name?: string | null;
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
  // Também carrega desired_delivery_date e subgrupo para uso no Calendário
  // (planning_date tem prioridade quando existir).
  const { data: validRows, error: vErr } = await (supabase as any)
    .from("runrunit_projects")
    .select("runrunit_project_id,desired_delivery_date,project_sub_group_name")
    .eq("is_open", true)
    .eq("is_tracking_enabled", true)
    .not("desired_delivery_date", "is", null);
  if (vErr) throw vErr;
  const validMap = new Map<number, { desired_delivery_date: string; project_sub_group_name: string | null }>();
  for (const r of (validRows ?? []) as {
    runrunit_project_id: number;
    desired_delivery_date: string | null;
    project_sub_group_name: string | null;
  }[]) {
    if (r.desired_delivery_date) validMap.set(r.runrunit_project_id, { desired_delivery_date: r.desired_delivery_date, project_sub_group_name: r.project_sub_group_name ?? null });
  }
  return all
    .filter((p) => validMap.has(p.runrunit_project_id))
    .map((p) => {
      const extra = validMap.get(p.runrunit_project_id);
      return { ...p, desired_delivery_date: extra?.desired_delivery_date ?? null, project_sub_group_name: (p as any).project_sub_group_name ?? extra?.project_sub_group_name ?? null };
    });
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
