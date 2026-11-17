import { describe, expect, it } from "vitest";
import {
  findMonthlyLaneConflict,
  isMonthlyLaneTitle,
  monthlyLaneTitle,
  monthlyTitleToDateISO,
  normalizeLaneTitle,
  parseMonthlyLaneTitle,
  type Lane,
} from "./dashboard";

const lane = (id: string, assignee_name: string, title: string): Lane => ({
  id,
  assignee_name,
  title,
  position: 0,
});

describe("padronizacao de filas mensais", () => {
  it("reconhece variacoes de caixa, separador e acento", () => {
    const variants = [
      "janeiro/2027",
      "Janeiro/2027",
      "JANEIRO/2027",
      " Janeiro / 2027 ",
      "Janeiro-2027",
      "Janeiro 2027",
      "Marco/2027",
      "mar\u00e7o/2027",
    ];
    for (const title of variants) {
      expect(isMonthlyLaneTitle(title)).toBe(true);
    }
    expect(normalizeLaneTitle("JANEIRO / 2027")).toBe("Janeiro/2027");
    expect(normalizeLaneTitle("Marco/2027")).toBe("Mar\u00e7o/2027");
  });

  it("converte o titulo para o primeiro dia do mes", () => {
    expect(monthlyTitleToDateISO("JANEIRO/2027")).toBe("2027-01-01");
    expect(monthlyTitleToDateISO("Fevereiro/2027")).toBe("2027-02-01");
    expect(monthlyTitleToDateISO("Marco/2027")).toBe("2027-03-01");
    expect(monthlyTitleToDateISO("Fila Janeiro/2027")).toBeNull();
    expect(monthlyTitleToDateISO("Janeiro/27")).toBeNull();
  });

  it("preserva filas personalizadas e remove espacos externos", () => {
    expect(normalizeLaneTitle("  Demandas especiais  ")).toBe("Demandas especiais");
    expect(parseMonthlyLaneTitle("Demandas especiais")).toBeNull();
    expect(monthlyLaneTitle("2027-01-15")).toBe("Janeiro/2027");
  });

  it("detecta conflito mensal por responsavel ignorando caixa e acento", () => {
    const lanes = [lane("1", "Camila", "JANEIRO/2027"), lane("2", "Gabriel", "FEVEREIRO/2027")];
    expect(findMonthlyLaneConflict(lanes, "Camila", "janeiro/2027")?.id).toBe("1");
    expect(findMonthlyLaneConflict(lanes, "camila", "janeiro / 2027")?.id).toBe("1");
    expect(findMonthlyLaneConflict(lanes, "Gabriel", "FEVEREIRO / 2027")?.id).toBe("2");
    expect(findMonthlyLaneConflict(lanes, "Camila", "Fevereiro/2027")).toBeNull();
    expect(findMonthlyLaneConflict(lanes, "Camila", "Janeiro/2027", "1")).toBeNull();
    expect(findMonthlyLaneConflict(lanes, "Camila", "Marco/2027")).toBeNull();
  });
});
