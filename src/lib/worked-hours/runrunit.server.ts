/**
 * Acesso somente-leitura ao relatório de horas do Runrun.it.
 * Arquivo server-only: nunca é incluído no bundle do navegador.
 */
import { isISODate } from "./period";

const RR_BASE = "https://runrun.it/api/v1.0";

export type WorkedHoursEnv = {
  appToken: string;
  userToken: string;
};

export type NormalizedWorkedRow = {
  runrunitUserId: string;
  runrunitUserName: string | null;
  workDate: string;
  manualSeconds: number;
  automaticSeconds: number;
  totalSeconds: number;
};

export type UnmappedUser = {
  runrunitUserId: string;
  runrunitUserName: string | null;
  totalSeconds: number;
};

export type ParsedReport = {
  rows: NormalizedWorkedRow[];
  rowsWithoutUser: number;
  rowsWithoutMapping: number;
  unmappedUsers: UnmappedUser[];
  rowsReceived: number;
};

function toSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function identifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

/**
 * Consulta GET /api/v1.0/reports/time_worked agrupado por data e usuário.
 * Preserva os segundos originais; a conversão para horas é só de apresentação.
 */
export async function fetchTimeWorkedReport(
  env: WorkedHoursEnv,
  period: { start: string; end: string },
): Promise<{ meta: unknown; result: Record<string, unknown>[] }> {
  if (!isISODate(period.start) || !isISODate(period.end)) {
    throw new Error("Período inválido para consulta de horas");
  }

  const params = new URLSearchParams({
    group_by: "date,user_id",
    period_type: "custom_range",
    period_start: period.start,
    period_end: period.end,
    period_unit: "day",
    include_capacity: "false",
    include_untracked: "true",
    include_others: "false",
  });

  const response = await fetch(`${RR_BASE}/reports/time_worked?${params.toString()}`, {
    headers: {
      "App-Key": env.appToken,
      "User-Token": env.userToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Runrun.it HTTP ${response.status}${response.status === 429 ? " (limite de requisições)" : ""}: ${body.slice(0, 300)}`,
    );
  }

  const payload: unknown = await response.json();
  if (Array.isArray(payload)) {
    return { meta: null, result: payload.filter(isRecord) };
  }
  if (isRecord(payload)) {
    const result = payload.result;
    return {
      meta: payload.meta ?? null,
      result: Array.isArray(result) ? result.filter(isRecord) : [],
    };
  }
  throw new Error("Formato inesperado na resposta de horas do Runrun.it");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normaliza o relatório e agrupa defensivamente por usuário + data.
 * Lançamentos sem usuário são contados e lançamentos com usuário não mapeado
 * são devolvidos separadamente para diagnóstico — nunca são inventados.
 */
export function parseWorkedReport(
  result: Record<string, unknown>[],
  mappedUserIds: Set<string>,
): ParsedReport {
  const grouped = new Map<string, NormalizedWorkedRow>();
  const unmapped = new Map<string, UnmappedUser>();
  let rowsWithoutUser = 0;
  let rowsWithoutMapping = 0;
  let rowsReceived = 0;

  for (const row of result) {
    rowsReceived += 1;

    const workDateRaw = text(pick(row, ["date", "work_date", "day"]));
    const workDate = workDateRaw?.slice(0, 10);
    const nestedUser = isRecord(row.user) ? row.user : null;
    const userId = identifier(pick(row, ["user_id", "userid"])) ?? identifier(nestedUser?.id);
    const userName = text(pick(row, ["user_name", "username"])) ?? text(nestedUser?.name);

    if (!isISODate(workDate)) continue;

    const manualSeconds = toSeconds(
      pick(row, ["manual_time", "manual_time_worked", "manual_seconds"]),
    );
    const automaticSeconds = toSeconds(
      pick(row, ["automatic_time", "automatic_time_worked", "automatic_seconds"]),
    );
    const reportedTotal = pick(row, ["time", "time_worked", "total_time", "total_seconds"]);
    const totalSeconds =
      reportedTotal === undefined ? manualSeconds + automaticSeconds : toSeconds(reportedTotal);

    if (!userId) {
      rowsWithoutUser += 1;
      continue;
    }

    if (!mappedUserIds.has(userId)) {
      rowsWithoutMapping += 1;
      const current = unmapped.get(userId);
      unmapped.set(userId, {
        runrunitUserId: userId,
        runrunitUserName: userName ?? current?.runrunitUserName ?? null,
        totalSeconds: (current?.totalSeconds ?? 0) + totalSeconds,
      });
      continue;
    }

    const key = `${userId}|${workDate}`;
    const current = grouped.get(key);
    if (current) {
      current.manualSeconds += manualSeconds;
      current.automaticSeconds += automaticSeconds;
      current.totalSeconds += totalSeconds;
      current.runrunitUserName ??= userName;
    } else {
      grouped.set(key, {
        runrunitUserId: userId,
        runrunitUserName: userName,
        workDate,
        manualSeconds,
        automaticSeconds,
        totalSeconds,
      });
    }
  }

  return {
    rows: [...grouped.values()],
    rowsWithoutUser,
    rowsWithoutMapping,
    unmappedUsers: [...unmapped.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
    rowsReceived,
  };
}
