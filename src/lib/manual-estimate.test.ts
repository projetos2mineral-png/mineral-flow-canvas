import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { effectiveEstimatedHours, parseManualHoursInput } from "./dashboard";

describe("estimativa manual", () => {
  it("ajuste manual substitui a automática", () => {
    expect(effectiveEstimatedHours(10, 4.5)).toBe(4.5);
  });
  it("sem ajuste manual usa a automática", () => {
    expect(effectiveEstimatedHours(10, null)).toBe(10);
  });
  it("ajuste manual zero é respeitado", () => {
    expect(effectiveEstimatedHours(10, 0)).toBe(0);
  });
  it("aceita vírgula decimal e vazio remove o ajuste", () => {
    expect(parseManualHoursInput("12,5")).toBe(12.5);
    expect(parseManualHoursInput("  ")).toBeNull();
  });
  it("rejeita valores inválidos", () => {
    expect(parseManualHoursInput("-2")).toBeUndefined();
    expect(parseManualHoursInput("abc")).toBeUndefined();
  });
});

describe("entrada em formato relógio", () => {
  it("1:30 vira 1,5h e 1h45 vira 1,75h", () => {
    expect(parseManualHoursInput("1:30")).toBe(1.5);
    expect(parseManualHoursInput("1h45")).toBe(1.75);
    expect(parseManualHoursInput("45min")).toBe(0.75);
  });
  it("rejeita minutos acima de 59", () => {
    expect(parseManualHoursInput("1:75")).toBeUndefined();
  });
});
