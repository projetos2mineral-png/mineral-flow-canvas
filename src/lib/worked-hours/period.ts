/**
 * Regras de período da importação de horas trabalhadas.
 * Datas são sempre strings ISO (YYYY-MM-DD) no fuso America/Cuiaba.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function todayInTimeZone(now: Date = new Date(), timeZone = "America/Cuiaba"): string {
  // en-CA produz YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function firstDayOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function previousMonthFirstDay(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return prev.toISOString().slice(0, 10);
}

export type ImportPeriod = {
  /** Primeiro dia consultado. */
  start: string;
  /** Último dia consultado (hoje). */
  end: string;
  /** Incluiu o mês anterior porque a execução ocorreu no dia 1. */
  includesPreviousMonth: boolean;
};

/**
 * Período da importação:
 * - sempre do dia 1 do mês atual até hoje;
 * - no primeiro dia do mês, inclui também o mês anterior inteiro.
 */
export function resolveImportPeriod(todayISO: string): ImportPeriod {
  const includesPreviousMonth = todayISO.endsWith("-01");
  return {
    start: includesPreviousMonth ? previousMonthFirstDay(todayISO) : firstDayOfMonth(todayISO),
    end: todayISO,
    includesPreviousMonth,
  };
}

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
];

/** Converte "Julho/2026" no intervalo de datas do mês (UTC, inclusivo). */
export function monthTitleToRange(title: string): { start: string; end: string } | null {
  const parts = title.trim().split("/");
  if (parts.length !== 2) return null;
  const monthIndex = MONTH_NAMES_PT.findIndex(
    (name) => name.toLowerCase() === parts[0].trim().toLowerCase(),
  );
  const year = Number(parts[1].trim());
  if (monthIndex < 0 || !Number.isInteger(year)) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
