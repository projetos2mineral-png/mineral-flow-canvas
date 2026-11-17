import { describe, expect, it } from "vitest";
import type { DailyWorkedRow } from "@/lib/worked-hours";
import {
  addDaysISO,
  dateToISODate,
  formatWeekRange,
  shiftWeekISO,
  startOfWeekISO,
  summarizeWeeklyWorkedHours,
  weekDates,
} from "@/lib/worked-hours/week";

const row = (
  user_name: string,
  work_date: string,
  total_seconds: number,
  manual_seconds = total_seconds,
): DailyWorkedRow => ({
  user_name,
  runrunit_user_id: `id-${user_name}`,
  runrunit_user_name: user_name,
  work_date,
  manual_seconds,
  automatic_seconds: total_seconds - manual_seconds,
  total_seconds,
});

describe("semanas de horas trabalhadas", () => {
  it("considera segunda a domingo", () => {
    expect(startOfWeekISO("2026-11-16")).toBe("2026-11-16");
    expect(startOfWeekISO("2026-11-22")).toBe("2026-11-16");
    expect(weekDates("2026-11-16")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(formatWeekRange("2026-11-16")).toBe("16/11/2026 a 22/11/2026");
  });

  it("converte datas locais para ISO sem deslocamento de fuso", () => {
    expect(dateToISODate(new Date(2026, 0, 3, 23, 30))).toBe("2026-01-03");
    expect(dateToISODate(new Date(2026, 10, 17, 0, 15))).toBe("2026-11-17");
  });

  it("navega entre semanas atravessando mes e ano", () => {
    expect(addDaysISO("2026-12-28", 7)).toBe("2027-01-04");
    expect(shiftWeekISO("2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftWeekISO("2027-01-04", -1)).toBe("2026-12-28");
  });

  it("soma apenas o responsavel da semana e calcula acumulado diario", () => {
    const rows = [
      row("Camila", "2026-11-16", 3600),
      row("Camila", "2026-11-18", 7200, 3600),
      row("Camila", "2026-11-22", 1800),
      row("Gabriel", "2026-11-17", 9999),
      row("Camila", "2026-11-23", 5000),
    ];
    const summary = summarizeWeeklyWorkedHours(rows, " camila ", "2026-11-16");
    expect(summary.totalSeconds).toBe(12600);
    expect(summary.manualSeconds).toBe(9000);
    expect(summary.automaticSeconds).toBe(3600);
    expect(summary.daysWithRecords).toBe(3);
    expect(summary.days.map((day) => day.totalSeconds)).toEqual([3600, 0, 7200, 0, 0, 0, 1800]);
    expect(summary.days.map((day) => day.cumulativeSeconds)).toEqual([
      3600, 3600, 10800, 10800, 10800, 10800, 12600,
    ]);
  });

  it("retorna semana zerada sem registros", () => {
    const summary = summarizeWeeklyWorkedHours([], "Camila", "2026-11-16");
    expect(summary.totalSeconds).toBe(0);
    expect(summary.daysWithRecords).toBe(0);
    expect(summary.days).toHaveLength(7);
    expect(summary.days.every((day) => day.totalSeconds === 0)).toBe(true);
  });
});
