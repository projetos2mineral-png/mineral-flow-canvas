import { supabase } from "@/integrations/supabase/client";

/**
 * Atividades de campo derivadas de um post-it existente do Kanban.
 * Modelo relacional: cada registro referencia o card de origem
 * (`parent_card_id`) e nunca duplica dados do projeto/cliente — estes são
 * lidos do próprio card/projeto no momento da renderização.
 */

export const FIELD_STATUSES = [
  "planejado",
  "agendado",
  "em andamento",
  "realizado",
  "cancelado",
] as const;

export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = {
  planejado: "Planejado",
  agendado: "Agendado",
  "em andamento": "Em Andamento",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

/** Cor própria do status de campo — não interfere no status do card original. */
export const FIELD_STATUS_DOT_CLASS: Record<FieldStatus, string> = {
  planejado: "bg-slate-400",
  agendado: "bg-amber-500",
  "em andamento": "bg-blue-500",
  realizado: "bg-emerald-500",
  cancelado: "bg-rose-500",
};

export const FIELD_STATUS_BADGE_CLASS: Record<FieldStatus, string> = {
  planejado: "bg-slate-100 text-slate-700 border-slate-200",
  agendado: "bg-amber-100 text-amber-800 border-amber-200",
  "em andamento": "bg-blue-100 text-blue-800 border-blue-200",
  realizado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelado: "bg-rose-100 text-rose-800 border-rose-200",
};

export function normalizeFieldStatus(s: string | null | undefined): FieldStatus {
  const v = (s ?? "").toLowerCase().trim();
  return (FIELD_STATUSES as readonly string[]).includes(v) ? (v as FieldStatus) : "planejado";
}

export type FieldActivityRow = {
  id: string;
  parent_card_id: string | null;
  runrunit_project_id: number;
  assignee_name: string;
  lane_id: string | null;
  activity: string;
  planned_date: string | null; // YYYY-MM-DD
  estimated_minutes: number;
  field_status: string;
  note: string | null;
  position: number;
  created_by: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const SELECT_COLS =
  "id,parent_card_id,runrunit_project_id,assignee_name,lane_id,activity,planned_date,estimated_minutes,field_status,note,position,created_by,created_at,updated_at";

/**
 * Converte entradas como "2h", "8", "12h30", "1:30", "90m", "1,5h" em minutos.
 * Retorna null quando a entrada é inválida (permite validar no formulário).
 */
export function parseHoursInput(input: string): number | null {
  const raw = (input ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;

  // 12h30 / 12h / 1:30
  const hm = raw.match(/^(\d{1,3})(?:h|:)(\d{1,2})?$/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    if (m > 59) return null;
    return h * 60 + m;
  }
  // 90m
  const mm = raw.match(/^(\d{1,4})m(?:in)?$/);
  if (mm) return parseInt(mm[1], 10);
  // 1,5 / 1.5 / 8
  const dec = raw.replace(",", ".").match(/^(\d{1,3}(?:\.\d{1,2})?)$/);
  if (dec) return Math.round(parseFloat(dec[1]) * 60);

  return null;
}

/** Formata minutos como "6h", "6h30" ou "45min". */
export function formatMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(minutes ?? 0)));
  if (total === 0) return "0h";
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Formata YYYY-MM-DD como DD/MM (sem deslocamento de fuso). */
export function formatFieldDateShort(dateISO: string | null | undefined): string | null {
  if (!dateISO) return null;
  const parts = dateISO.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  return `${parts[2]}/${parts[1]}`;
}

export async function fetchFieldActivities(): Promise<FieldActivityRow[]> {
  const { data, error } = await (supabase as any)
    .from("dashboard_field_activities")
    .select(SELECT_COLS)
    .order("planned_date", { ascending: true, nullsFirst: false });
  if (error) {
    // Tabela ainda não criada no banco → não quebra o Kanban existente.
    console.error("Falha ao carregar atividades de campo:", error);
    return [];
  }
  return (data ?? []) as FieldActivityRow[];
}

export type FieldActivityInput = {
  parent_card_id: string | null;
  runrunit_project_id: number;
  assignee_name: string;
  lane_id: string | null;
  activity: string;
  planned_date: string | null;
  estimated_minutes: number;
  field_status: FieldStatus;
  note: string | null;
  created_by?: string | null;
};

export async function createFieldActivity(input: FieldActivityInput): Promise<FieldActivityRow> {
  const { data, error } = await (supabase as any)
    .from("dashboard_field_activities")
    .insert({ ...input, position: 0 })
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return data as FieldActivityRow;
}

export async function updateFieldActivity(
  id: string,
  patch: Partial<
    Pick<
      FieldActivityRow,
      "activity" | "planned_date" | "estimated_minutes" | "field_status" | "note" | "lane_id" | "position"
    >
  >
) {
  const { error } = await (supabase as any)
    .from("dashboard_field_activities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFieldActivity(id: string) {
  const { error } = await (supabase as any)
    .from("dashboard_field_activities")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Soma de horas estimadas (em minutos) de um conjunto de atividades de campo. */
export function sumFieldMinutes(rows: FieldActivityRow[]): number {
  return rows.reduce((acc, r) => acc + (Number(r.estimated_minutes) || 0), 0);
}
