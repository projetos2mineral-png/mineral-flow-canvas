import { describe, expect, it } from "vitest";
import { DAILY_START_UTC_HOUR, isDailyWindowOpen, shouldStartMissedDaily, utcStartOfDay } from "./schedule";

describe("janela do sync diário", () => {
  it("abre às 10:00 UTC e permanece aberta no resto do dia", () => {
    expect(isDailyWindowOpen(new Date(Date.UTC(2026, 10, 10, DAILY_START_UTC_HOUR - 1)))).toBe(false);
    expect(isDailyWindowOpen(new Date(Date.UTC(2026, 10, 10, DAILY_START_UTC_HOUR)))).toBe(true);
    expect(isDailyWindowOpen(new Date(Date.UTC(2026, 10, 10, 23, 59)))).toBe(true);
  });

  it("só inicia o diário atrasado uma vez por dia UTC", () => {
    const now = new Date(Date.UTC(2026, 10, 10, 12));
    expect(shouldStartMissedDaily(now, false)).toBe(true);
    expect(shouldStartMissedDaily(now, true)).toBe(false);
    expect(shouldStartMissedDaily(new Date(Date.UTC(2026, 10, 10, 9)), false)).toBe(false);
  });

  it("calcula o início do dia UTC", () => {
    expect(utcStartOfDay(new Date(Date.UTC(2026, 10, 10, 23, 30))).toISOString()).toBe(
      "2026-11-10T00:00:00.000Z",
    );
  });
});
