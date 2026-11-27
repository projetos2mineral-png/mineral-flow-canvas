import { describe, expect, it } from "vitest";
import { DIEF_MONTHS, checkedMonths, isDiefDemand, toggleMonth } from "./dief-checklist";

describe("modelo mensal DIEF", () => {
  it("aplica somente a demandas DIEF", () => {
    expect(isDiefDemand("DIEF 2026")).toBe(true);
    expect(isDiefDemand("dief - Cliente X")).toBe(true);
    expect(isDiefDemand("Relatório anual")).toBe(false);
    expect(isDiefDemand("DIEFERENTE")).toBe(false);
  });
  it("exibe os 12 meses de janeiro a dezembro", () => {
    expect(DIEF_MONTHS).toHaveLength(12);
    expect(DIEF_MONTHS[0]).toBe("Jan");
    expect(DIEF_MONTHS[11]).toBe("Dez");
  });
  it("alterna um mês sem apagar marcações antigas", () => {
    const next = toggleMonth(["agisa"], 3, true);
    expect(next).toEqual(["agisa", "mes:03"]);
    expect([...checkedMonths(next)]).toEqual([3]);
    expect(toggleMonth(next, 3, false)).toEqual(["agisa"]);
  });
  it("marcações de um responsável não afetam outro", () => {
    const alessandra = toggleMonth([], 1, true);
    const caio: string[] = [];
    expect(checkedMonths(alessandra).has(1)).toBe(true);
    expect(checkedMonths(caio).size).toBe(0);
  });
});
