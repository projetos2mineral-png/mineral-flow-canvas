/**
 * Rotina server-side de importação de horas trabalhadas do Runrun.it.
 * Somente leitura no Runrun.it; grava apenas nas tabelas dashboard_* locais.
 * Nunca expõe tokens ao cliente.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveImportPeriod, todayInTimeZone } from "./period";
import { fetchTimeWorkedReport, parseWorkedReport } from "./runrunit.server";

const STALE_IMPORT_AFTER_MS = 30 * 60 * 1000;

type Env = {
  url: string;
  serviceKey: string;
  appToken: string;
  userToken: string;
};

export function readWorkedHoursEnv(): Env {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.DB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appToken = process.env.RUNRUNIT_APP_TOKEN;
  const userToken = process.env.RUNRUNIT_USER_TOKEN;
  const missing = [
    !url && "SUPABASE_URL",
    !serviceKey && "DB_SERVICE_ROLE_KEY",
    !appToken && "RUNRUNIT_APP_TOKEN",
    !userToken && "RUNRUNIT_USER_TOKEN",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Configuração ausente no servidor: ${missing.join(", ")}`);
  return { url: url!, serviceKey: serviceKey!, appToken: appToken!, userToken: userToken! };
}

function adminClient(env: Env): SupabaseClient {
  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export type ImportTriggerSource = "manual" | "scheduled";

export type WorkedHoursImportResult = {
  importId: string;
  status: "completed" | "completed_with_warnings";
  periodStart: string;
  periodEnd: string;
  includesPreviousMonth: boolean;
  rowsReceived: number;
  rowsUpserted: number;
  rowsChanged: number;
  rowsWithoutUser: number;
  rowsWithoutMapping: number;
};

type MappingRow = {
  user_name: string;
  runrunit_user_id: string;
  runrunit_user_name: string | null;
};

type ApplyResult = { upserted?: number; changed?: number } | null;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: string })?.message;
  return message ? String(message) : String(error);
}

/**
 * Executa uma importação completa:
 * 1. período atual (dia 1 até hoje; inclui mês anterior no dia 1);
 * 2. relatório agrupado por data e usuário;
 * 3. vínculo por ID oficial;
 * 4. upsert transacional por usuário/data + histórico de diferenças.
 */
export async function runWorkedHoursImport(options?: {
  triggerSource?: ImportTriggerSource;
  now?: Date;
}): Promise<WorkedHoursImportResult> {
  const env = readWorkedHoursEnv();
  const db = adminClient(env);
  const triggerSource = options?.triggerSource ?? "manual";
  const today = todayInTimeZone(options?.now ?? new Date());
  const period = resolveImportPeriod(today);
  const now = new Date();

  // Libera execuções presas de tentativas anteriores (o processo pode ter caído).
  await db
    .from("dashboard_worked_hours_imports")
    .update({
      status: "failed",
      finished_at: now.toISOString(),
      error_message: "Importação anterior interrompida (sem término)",
    })
    .eq("status", "running")
    .lt("started_at", new Date(now.getTime() - STALE_IMPORT_AFTER_MS).toISOString());

  const { data: created, error: createError } = await db
    .from("dashboard_worked_hours_imports")
    .insert({
      source: "runrunit",
      trigger_source: triggerSource,
      status: "running",
      period_start: period.start,
      period_end: period.end,
      started_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    if ((createError as { code?: string }).code === "23505") {
      throw new Error("Já existe uma importação de horas em andamento. Aguarde o término.");
    }
    throw new Error(`Não foi possível registrar a importação: ${createError.message}`);
  }

  const importId = String(created.id);

  try {
    const { data: mappingsData, error: mappingError } = await db
      .from("dashboard_user_runrunit_mapping")
      .select("user_name,runrunit_user_id,runrunit_user_name")
      .eq("is_active", true);

    if (mappingError) throw new Error(`Falha ao carregar mapeamentos: ${mappingError.message}`);
    const mappings = (mappingsData ?? []) as MappingRow[];
    const byUserId = new Map(mappings.map((m) => [m.runrunit_user_id, m]));

    const report = await fetchTimeWorkedReport(
      { appToken: env.appToken, userToken: env.userToken },
      { start: period.start, end: period.end },
    );
    const parsed = parseWorkedReport(report.result, new Set(byUserId.keys()));

    const rows = parsed.rows.map((row) => {
      const mapping = byUserId.get(row.runrunitUserId)!;
      return {
        user_name: mapping.user_name,
        runrunit_user_id: row.runrunitUserId,
        runrunit_user_name: row.runrunitUserName ?? mapping.runrunit_user_name ?? null,
        work_date: row.workDate,
        manual_seconds: row.manualSeconds,
        automatic_seconds: row.automaticSeconds,
        total_seconds: row.totalSeconds,
      };
    });

    let applied: ApplyResult = null;
    if (rows.length > 0) {
      const { data, error } = await db.rpc("dashboard_apply_worked_hours", {
        p_import_id: importId,
        p_rows: rows,
      });
      if (error) throw new Error(`Falha ao gravar horas trabalhadas: ${error.message}`);
      applied = (data ?? null) as ApplyResult;
    }

    const warnings = parsed.unmappedUsers.length > 0 || parsed.rowsWithoutUser > 0;
    const status = warnings ? "completed_with_warnings" : "completed";
    const summary = {
      period,
      mappings: mappings.length,
      rows_without_user: parsed.rowsWithoutUser,
      unmapped_users: parsed.unmappedUsers,
    };

    await db
      .from("dashboard_worked_hours_imports")
      .update({
        status,
        finished_at: new Date().toISOString(),
        rows_received: parsed.rowsReceived,
        rows_upserted: applied?.upserted ?? 0,
        rows_changed: applied?.changed ?? 0,
        rows_without_user: parsed.rowsWithoutUser,
        rows_without_mapping: parsed.rowsWithoutMapping,
        result_summary: summary,
      })
      .eq("id", importId);

    return {
      importId,
      status,
      periodStart: period.start,
      periodEnd: period.end,
      includesPreviousMonth: period.includesPreviousMonth,
      rowsReceived: parsed.rowsReceived,
      rowsUpserted: applied?.upserted ?? 0,
      rowsChanged: applied?.changed ?? 0,
      rowsWithoutUser: parsed.rowsWithoutUser,
      rowsWithoutMapping: parsed.rowsWithoutMapping,
    };
  } catch (error) {
    await db
      .from("dashboard_worked_hours_imports")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: errorText(error).slice(0, 2000),
      })
      .eq("id", importId);
    throw error;
  }
}
