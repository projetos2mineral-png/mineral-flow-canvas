import { describe, expect, it } from "vitest";
import {
  buildLanePeriodIndex,
  canonicalAssigneeKey,
  findLaneForCard,
  monthPeriodKey,
  parseMonthlyPeriodFromDate,
  parseMonthlyPeriodFromTitle,
  type Lane,
} from "@/lib/dashboard";

describe("canonicalAssigneeKey", () => {
  it("ignora acentos, caixa, NBSP e espaços repetidos", () => {
    expect(canonicalAssigneeKey("  JOSÉ\u00a0  da   Silva ")).toBe("jose da silva");
    expect(canonicalAssigneeKey("Jose da Silva")).toBe("jose da silva");
  });

  it("não confunde responsáveis diferentes", () => {
    expect(canonicalAssigneeKey("José Silva")).not.toBe(canonicalAssigneeKey("Jose"));
  });

  it("retorna vazio para ausente", () => {
    expect(canonicalAssigneeKey(null)).toBe("");
    expect(canonicalAssigneeKey("   ")).toBe("");
  });
});

describe("parseMonthlyPeriodFromDate", () => {
  it("interpreta datas ISO e timestamps pelo dia local informado", () => {
    expect(parseMonthlyPeriodFromDate("2026-10-31")).toEqual({ year: 2026, month: 10 });
    expect(parseMonthlyPeriodFromDate("2026-10-31T23:00:00-03:00")).toEqual({
      year: 2026,
      month: 10,
    });
    expect(parseMonthlyPeriodFromDate("2026-1-5")).toEqual({ year: 2026, month: 1 });
  });

  it("rejeita formatos ambíguos ou inválidos", () => {
    expect(parseMonthlyPeriodFromDate("31/10/2026")).toBeNull();
    expect(parseMonthlyPeriodFromDate("2026-13-01")).toBeNull();
    expect(parseMonthlyPeriodFromDate("")).toBeNull();
    expect(parseMonthlyPeriodFromDate(null)).toBeNull();
  });
});

describe("parseMonthlyPeriodFromTitle", () => {
  it.each([
    ["Outubro/2026", "2026-10"],
    ["outubro de 2026", "2026-10"],
    ["OUTUBRO 2026", "2026-10"],
    ["Out/2026", "2026-10"],
    ["out-2026", "2026-10"],
    ["10/2026", "2026-10"],
    ["2026-10", "2026-10"],
    ["Março/2026", "2026-03"],
    ["Marco/2026", "2026-03"],
    ["Janeiro 2027", "2027-01"],
    ["Dez/2026", "2026-12"],
  ])("interpreta %s como %s", (title: string, expected: string) => {
    const period = parseMonthlyPeriodFromTitle(title);
    expect(period).not.toBeNull();
    expect(monthPeriodKey(period!)).toBe(expected);
  });

  it("rejeita títulos sem período único", () => {
    expect(parseMonthlyPeriodFromTitle("Sem fila")).toBeNull();
    expect(parseMonthlyPeriodFromTitle("Outubro")).toBeNull();
    expect(parseMonthlyPeriodFromTitle("2026")).toBeNull();
    expect(parseMonthlyPeriodFromTitle("13/2026")).toBeNull();
    expect(parseMonthlyPeriodFromTitle("Outubro/2026 - Novembro/2026")).toBeNull();
    expect(parseMonthlyPeriodFromTitle("Outubro 2026 2027")).toBeNull();
    expect(parseMonthlyPeriodFromTitle(null)).toBeNull();
  });
});

describe("findLaneForCard", () => {
  const lanes: Lane[] = [
    { id: "out-a", assignee_name: "José", title: "Outubro de 2026", position: 0 },
    { id: "out-b", assignee_name: "JOSE", title: "2026-10", position: 1 },
    { id: "nov", assignee_name: "José", title: "Novembro/2026", position: 2 },
    { id: "maria", assignee_name: "Maria", title: "Sem fila", position: 3 },
  ];
  const index = buildLanePeriodIndex(lanes);

  it("considera duplicatas do mesmo responsável e mês como ambíguas", () => {
    const result = findLaneForCard(
      { assignee_name: "Jose", desired_delivery_date: "2026-10-10" },
      index,
    );
    expect(result.reason).toBe("ambiguo");
    expect(result.lane).toBeNull();
    expect(result.candidates.map((lane) => lane.id)).toEqual(["out-a", "out-b"]);
  });

  it("encontra a fila única", () => {
    const result = findLaneForCard(
      { assignee_name: " José ", desired_delivery_date: "2026-11-05" },
      index,
    );
    expect(result.reason).toBe("match");
    expect(result.lane?.id).toBe("nov");
    expect(result.periodKey).toBe("2026-11");
  });

  it("separa ausência de fila do responsável, do mês e título inválido", () => {
    expect(
      findLaneForCard(
        { assignee_name: "Carlos", desired_delivery_date: "2026-10-10" },
        index,
      ).reason,
    ).toBe("sem_fila_do_responsavel");

    expect(
      findLaneForCard(
        { assignee_name: "José", desired_delivery_date: "2026-12-10" },
        index,
      ).reason,
    ).toBe("sem_fila_do_mes");

    expect(
      findLaneForCard(
        { assignee_name: "Maria", desired_delivery_date: "2026-10-10" },
        index,
      ).reason,
    ).toBe("titulo_de_fila_invalido");
  });

  it("separa dados ausentes", () => {
    expect(
      findLaneForCard(
        { assignee_name: "José", desired_delivery_date: null },
        index,
      ).reason,
    ).toBe("sem_data");
    expect(
      findLaneForCard(
        { assignee_name: null, desired_delivery_date: "2026-10-10" },
        index,
      ).reason,
    ).toBe("sem_responsavel");
  });

  it("inclui todas as filas no índice com período interpretado", () => {
    expect(index.entries).toHaveLength(4);
    expect(index.entries.map((entry) => entry.periodKey)).toEqual([
      "2026-10",
      "2026-10",
      "2026-11",
      null,
    ]);
  });
});
