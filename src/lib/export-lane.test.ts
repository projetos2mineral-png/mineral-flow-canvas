import { describe, it, expect } from "vitest";
import { buildLaneExportRows, laneExportFileName } from "./export-projects";

const project = { project_name: "PRAD", client_name: "Lagoa", desired_delivery_date: "2026-11-09" };

describe("exportação da fila", () => {
  it("gera as colunas com dados corretos", () => {
    const rows = buildLaneExportRows([{ project, is_tec: true, is_geo: false }]);
    expect(rows[0]).toEqual(["Nome do projeto", "Cliente", "Data de entrega desejada", "Classificação"]);
    expect(rows[1]).toEqual(["PRAD", "Lagoa", "09/11/2026", "TEC"]);
  });
  it("classificação TEC / GEO, GEO e vazia", () => {
    const rows = buildLaneExportRows([
      { project, is_tec: true, is_geo: true },
      { project, is_tec: false, is_geo: true },
      { project, is_tec: false, is_geo: false },
    ]);
    expect(rows.slice(1).map((r) => r[3])).toEqual(["TEC / GEO", "GEO", ""]);
  });
  it("fila vazia gera só cabeçalhos", () => {
    expect(buildLaneExportRows([])).toHaveLength(1);
  });
  it("nomeia o arquivo pelo título", () => {
    expect(laneExportFileName("Outubro/2026")).toBe("Outubro-2026.xlsx");
  });
});
