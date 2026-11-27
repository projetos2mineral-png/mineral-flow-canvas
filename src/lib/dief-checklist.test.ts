import { describe, expect, it } from "vitest";
import {
  DIEF_MONTHS,
  checkedMonths,
  checkedMonthsForClient,
  clientKey,
  clientMonthKey,
  isDiefDemand,
  monthKey,
  removeClientFromSelections,
  renameClientInSelections,
  toggleClientMonth,
  toggleMonth,
  totalCheckedMonths,
} from "./dief-checklist";

describe("modelo DIEF (Matriz Cliente × Mês)", () => {
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

  it("gera chaves compostas estáveis e normalizadas", () => {
    expect(clientMonthKey("Agisa", 3)).toBe("agisa::mes:03");
    expect(clientMonthKey("  Anna   Clara  ", 12)).toBe("anna clara::mes:12");
    expect(clientKey("  MINERAÇÃO  VALE ")).toBe("mineração vale");
    expect(clientMonthKey("Agisa", 1)).toBe("agisa::mes:01");
  });

  it("conta somente os meses do cliente informado", () => {
    const selections = [
      "agisa::mes:01",
      "agisa::mes:02",
      "anna clara::mes:03",
      "med:legado",
      "mes:05", // formato legado não entra na matriz
    ];
    expect([...checkedMonthsForClient(selections, "Agisa")]).toEqual([1, 2]);
    expect([...checkedMonthsForClient(selections, "Anna Clara")]).toEqual([3]);
    expect([...checkedMonthsForClient(selections, "Mineração Vale")]).toEqual([]);
    expect(totalCheckedMonths(selections, ["Agisa", "Anna Clara", "Mineração Vale"])).toBe(3);
  });

  it("alterna um mês sem apagar marcações de outros clientes", () => {
    const initial = ["agisa::mes:01", "anna clara::mes:03", "item genérico"];
    const next = toggleClientMonth(initial, "Agisa", 2, true);
    expect(next).toEqual(["agisa::mes:01", "anna clara::mes:03", "item genérico", "agisa::mes:02"]);
    expect([...checkedMonthsForClient(next, "Agisa")]).toEqual([1, 2]);
    expect(toggleClientMonth(next, "Agisa", 2, false)).toEqual(initial);
  });

  it("renomeia um cliente migrando todas as suas marcações", () => {
    const selections = [
      "agisa::mes:01",
      "agisa::mes:02",
      "agisa::mes:12",
      "anna clara::mes:03",
      "item genérico",
    ];
    const next = renameClientInSelections(selections, "Agisa", "Agisa Mineração");
    expect(next).toEqual([
      "agisa mineração::mes:01",
      "agisa mineração::mes:02",
      "agisa mineração::mes:12",
      "anna clara::mes:03",
      "item genérico",
    ]);
    expect([...checkedMonthsForClient(next, "Agisa Mineração")]).toEqual([1, 2, 12]);
    expect([...checkedMonthsForClient(next, "Agisa")]).toEqual([]);
    expect([...checkedMonthsForClient(next, "Anna Clara")]).toEqual([3]);
  });

  it("exclui um cliente removendo apenas as suas marcações", () => {
    const selections = [
      "agisa::mes:01",
      "agisa::mes:02",
      "anna clara::mes:03",
      "mes:04",
      "item genérico",
    ];
    expect(removeClientFromSelections(selections, "Agisa")).toEqual([
      "anna clara::mes:03",
      "mes:04",
      "item genérico",
    ]);
  });

  it("mantém o formato legado `mes:XX` sem descartar dados antigos", () => {
    expect(monthKey(3)).toBe("mes:03");
    const next = toggleMonth(["agisa"], 3, true);
    expect(next).toEqual(["agisa", "mes:03"]);
    expect([...checkedMonths(next)]).toEqual([3]);
    expect(toggleMonth(next, 3, false)).toEqual(["agisa"]);
  });
});
