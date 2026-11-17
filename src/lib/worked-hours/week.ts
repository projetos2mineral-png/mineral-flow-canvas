import { normalizeAssigneeName } from "@/lib/dashboard";
import { todayInTimeZone } from "@/lib/worked-hours/period";
import type { DailyWorkedRow } from "@/lib/worked-hours";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKDAY_SHORT_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

function parseISODate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateToISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysISO(dateISO: string, days: number): string {
  const date = parseISODate(dateISO);
  if (!date) return dateISO;
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

export function startOfWeekISO(dateISO: string): string {
  const date = parseISODate(dateISO);
  if (!date) return dateISO;
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return toISODate(date);
}

export function shiftWeekISO(weekStartISO: string, weeks: number): string {
  return addDaysISO(startOfWeekISO(weekStartISO), weeks * 7);
}

export function weekRangeFromStart(weekStartISO: string): { start: string; end: string } {
  const start = startOfWeekISO(weekStartISO);
  return { start, end: addDaysISO(start, 6) };
}

export function weekDates(weekStartISO: string): string[] {
  const start = startOfWeekISO(weekStartISO);
  return Array.from({ length: 7 }, (_, index) => addDaysISO(start, index));
}

export function currentWeekStartISO(now: Date = new Date(), timeZone = "America/Cuiaba"): string {
  return startOfWeekISO(todayInTimeZone(now, timeZone));
}

export function formatDateBR(dateISO: string): string {
  const parts = dateISO.split("-");
  if (parts.length !== 3) return dateISO;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDayMonthBR(dateISO: string): string {
  const parts = dateISO.split("-");
  if (parts.length !== 3) return dateISO;
  return `${parts[2]}/${parts[1]}`;
}

export function formatWeekRange(weekStartISO: string): string {
  const { start, end } = weekRangeFromStart(weekStartISO);
  return `${formatDateBR(start)} a ${formatDateBR(end)}`;
}

export type WeeklyWorkedDay = {
  date: string;
  weekday: string;
  dayLabel: string;
  totalSeconds: number;
  manualSeconds: number;
  automaticSeconds: number;
  cumulativeSeconds: number;
  hasRecords: boolean;
};

export type WeeklyWorkedSummary = {
  start: string;
  end: string;
  totalSeconds: number;
  manualSeconds: number;
  automaticSeconds: number;
  daysWithRecords: number;
  days: WeeklyWorkedDay[];
};

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeWeeklyWorkedHours(
  rows: DailyWorkedRow[],
  userName: string,
  weekStartISO: string,
): WeeklyWorkedSummary {
  const { start, end } = weekRangeFromStart(weekStartISO);
  const dates = weekDates(start);
  const targetKey = normalizeAssigneeName(userName);
  const totalsByDate = new Map<
    string,
    { totalSeconds: number; manualSeconds: number; automaticSeconds: number }
  >();
  const datesWithRows = new Set<string>();

  if (targetKey) {
    for (const row of rows) {
      if (normalizeAssigneeName(row.user_name) !== targetKey) continue;
      if (row.work_date < start || row.work_date > end) continue;
      const current = totalsByDate.get(row.work_date) ?? {
        totalSeconds: 0,
        manualSeconds: 0,
        automaticSeconds: 0,
      };
      current.totalSeconds += toNumber(row.total_seconds);
      current.manualSeconds += toNumber(row.manual_seconds);
      current.automaticSeconds += toNumber(row.automatic_seconds);
      totalsByDate.set(row.work_date, current);
      datesWithRows.add(row.work_date);
    }
  }

  let cumulativeSeconds = 0;
  const days = dates.map((date, index) => {
    const totals = totalsByDate.get(date) ?? {
      totalSeconds: 0,
      manualSeconds: 0,
      automaticSeconds: 0,
    };
    cumulativeSeconds += totals.totalSeconds;
    return {
      date,
      weekday: WEEKDAY_SHORT_PT[index],
      dayLabel: formatDayMonthBR(date),
      ...totals,
      cumulativeSeconds,
      hasRecords: datesWithRows.has(date),
    };
  });

  return {
    start,
    end,
    totalSeconds: cumulativeSeconds,
    manualSeconds: days.reduce((sum, day) => sum + day.manualSeconds, 0),
    automaticSeconds: days.reduce((sum, day) => sum + day.automaticSeconds, 0),
    daysWithRecords: datesWithRows.size,
    days,
  };
}
