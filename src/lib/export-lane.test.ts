import { describe, it, expect } from "vitest";
import { buildLaneExportRows, laneExportFileName } from "./export-projects";

describe("exportação da fila", () => {
  it("gera exatamente três colunas com dados corretos", () => {
    const rows = buildLaneExportRows([
      { project: { project_name: "PRAD", client_name: "Lagoa", desired_delivery_date: "2026-11-09" } },
    ]);
    expect(rows[0]).toEqual(["Nome do projeto", "Cliente", "Data de entrega desejada"]);
    expect(rows[1]).toEqual(["PRAD", "Lagoa", "09/11/2026"]);
  });
  it("fila vazia gera só cabeçalhos", () => {
    expect(buildLaneExportRows([])).toHaveLength(1);
  });
  it("nomeia o arquivo pelo título", () => {
    expect(laneExportFileName("Outubro/2026")).toBe("Outubro-2026.xlsx");
  });
});
