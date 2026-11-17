import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAssigneeName } from "@/lib/dashboard";

export type DailyWorkedRow = {
  user_name: string;
  runrunit_user_id: string;
  runrunit_user_name: string | null;
  work_date: string;
  manual_seconds: number;
  automatic_seconds: number;
  total_seconds: number;
};

export type WorkedHoursImportRow = {
  id: string;
  status: "running" | "completed" | "completed_with_warnings" | "failed";
  trigger_source: "manual" | "scheduled";
  period_start: string;
  period_end: string;
  started_at: string;
  finished_at: string | null;
  rows_received: number;
  rows_upserted: number;
  rows_changed: number;
  rows_without_user: number;
  rows_without_mapping: number;
  result_summary: unknown;
  error_message: string | null;
};

export type WorkedHoursSummary = {
  userName: string;
  totalSeconds: number;
  manualSeconds: number;
  automaticSeconds: number;
  days: number;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lê as horas diárias já importadas. Se a migration ainda não tiver sido
 * aplicada, devolve lista vazia para não quebrar a aba Capacidade.
 */
export async function fetchDailyWorkedHours(range?: {
  start: string;
  end: string;
}): Promise<DailyWorkedRow[]> {
  const db = supabase as unknown as SupabaseClient;
  let query = db
    .from("dashboard_user_daily_worked")
    .select(
      "user_name,runrunit_user_id,runrunit_user_name,work_date,manual_seconds,automatic_seconds,total_seconds",
    )
    .order("work_date", { ascending: true });

  if (range) query = query.gte("work_date", range.start).lte("work_date", range.end);

  const { data, error } = await query;
  if (error) {
    console.warn("Horas trabalhadas indisponíveis:", error.message);
    return [];
  }
  return ((data ?? []) as DailyWorkedRow[]).map((row) => ({
    ...row,
    manual_seconds: toNumber(row.manual_seconds),
    automatic_seconds: toNumber(row.automatic_seconds),
    total_seconds: toNumber(row.total_seconds),
  }));
}

export async function fetchWorkedHoursImports(limit = 5): Promise<WorkedHoursImportRow[]> {
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db
    .from("dashboard_worked_hours_imports")
    .select(
      "id,status,trigger_source,period_start,period_end,started_at,finished_at,rows_received,rows_upserted,rows_changed,rows_without_user,rows_without_mapping,result_summary,error_message",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Importações de horas indisponíveis:", error.message);
    return [];
  }
  return (data ?? []) as WorkedHoursImportRow[];
}

/** Agrega segundos por responsável da Central (comparação normalizada). */
export function aggregateWorkedHours(rows: DailyWorkedRow[]): Map<string, WorkedHoursSummary> {
  const result = new Map<string, WorkedHoursSummary>();
  for (const row of rows) {
    const key = normalizeAssigneeName(row.user_name);
    if (!key) continue;
    const current = result.get(key);
    if (current) {
      current.totalSeconds += toNumber(row.total_seconds);
      current.manualSeconds += toNumber(row.manual_seconds);
      current.automaticSeconds += toNumber(row.automatic_seconds);
      current.days += 1;
    } else {
      result.set(key, {
        userName: row.user_name.trim(),
        totalSeconds: toNumber(row.total_seconds),
        manualSeconds: toNumber(row.manual_seconds),
        automaticSeconds: toNumber(row.automatic_seconds),
        days: 1,
      });
    }
  }
  return result;
}

export function secondsToHours(seconds: number): number {
  return (Number.isFinite(seconds) ? seconds : 0) / 3600;
}
