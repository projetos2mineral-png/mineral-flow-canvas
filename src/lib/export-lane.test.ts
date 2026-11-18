import { describe, it, expect } from "vitest";
import { buildLaneExportRows, laneExportFileName } from "./export-projects";

const project = { project_name: "PRAD", client_name: "Lagoa", desired_delivery_date: "2026-11-09" };

const demand = {
  demand: {
    id: "d1",
    name: "Relatório avulso",
    client_name: "Serra",
    desired_date: "2026-11-12",
    description: "Primeira linha\nSegunda linha",
  },
  assigneeName: "Ana",
};

describe("exportação da fila", () => {
  it("gera as colunas com dados corretos", () => {
    const rows = buildLaneExportRows([{ project, is_tec: true, is_geo: false }]);
    expect(rows[0]).toEqual([
      "Nome do projeto",
      "Cliente",
      "Data de entrega desejada",
      "Classificação",
      "Observação",
    ]);
    expect(rows[1]).toEqual(["PRAD", "Lagoa", "09/11/2026", "TEC", ""]);
  });
  it("classificação TEC / GEO, GEO e vazia", () => {
    const rows = buildLaneExportRows([
      { project, is_tec: true, is_geo: true },
      { project, is_tec: false, is_geo: true },
      { project, is_tec: false, is_geo: false },
    ]);
    expect(rows.slice(1).map((r) => r[3])).toEqual(["TEC, GEO", "GEO", ""]);
  });
  it("lê as etiquetas do card do Kanban", () => {
    const rows = buildLaneExportRows([
      { project, card: { is_tec: true, is_geo: true } },
      { project, card: { is_tec: false, is_geo: true } },
      { project, card: null },
    ]);
    expect(rows.slice(1).map((r) => r[3])).toEqual(["TEC, GEO", "GEO", ""]);
  });
  it("fila vazia gera só cabeçalhos", () => {
    expect(buildLaneExportRows([])).toHaveLength(1);
  });
  it("nomeia o arquivo pelo título", () => {
    expect(laneExportFileName("Outubro/2026")).toBe("Outubro-2026.xlsx");
  });
  it("inclui REV na classificação", () => {
    const rows = buildLaneExportRows([{ project, is_tec: true, is_geo: false, is_rev: true }]);
    expect(rows[1][3]).toBe("TEC, REV");
  });
  it("inclui CAM na classificação", () => {
    const rows = buildLaneExportRows([{ project, is_tec: true, is_geo: false, is_campo: true }]);
    expect(rows[1][3]).toBe("TEC, CAM");
  });

  it("inclui a observação do card preservando quebras de linha", () => {
    const rows = buildLaneExportRows([
      { project, internal_note: "Linha 1\nLinha 2" },
      { project: { ...project, project_name: "Sem nota" } },
      { project: { ...project, project_name: "Nota em branco" }, internal_note: "   \n  " },
    ]);
    expect(rows[1][4]).toBe("Linha 1\nLinha 2");
    expect(rows[2][4]).toBe("");
    expect(rows[3][4]).toBe("");
  });

  it("lê a observação guardada no card aninhado", () => {
    const rows = buildLaneExportRows([{ project, card: { internal_note: "Nota do card" } }]);
    expect(rows[1][4]).toBe("Nota do card");
  });

  it("acrescenta as demandas avulsas em seção separada", () => {
    const rows = buildLaneExportRows([{ project }], [demand]);
    expect(rows[2]).toEqual([]);
    expect(rows[3]).toEqual(["Demandas avulsas"]);
    expect(rows[4]).toEqual([
      "Relatório avulso",
      "Serra",
      "12/11/2026",
      "Demanda avulsa",
      "Primeira linha\nSegunda linha",
    ]);
  });

  it("não cria seção de demandas quando não há demandas", () => {
    const rows = buildLaneExportRows([{ project }], []);
    expect(rows).toHaveLength(2);
  });

  it("não duplica projetos nem demandas vindos de mais de uma origem", () => {
    const rows = buildLaneExportRows(
      [
        { runrunit_project_id: 10, project },
        { runrunit_project_id: 10, project },
      ],
      [demand, { ...demand }],
    );
    expect(rows.filter((r) => r[0] === "PRAD")).toHaveLength(1);
    expect(rows.filter((r) => r[0] === "Relatório avulso")).toHaveLength(1);
  });
});
