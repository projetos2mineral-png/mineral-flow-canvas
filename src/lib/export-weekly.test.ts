import { describe, it, expect } from "vitest";
import {
  buildWeeklyExportRows,
  weeklyExportFileName,
  type WeeklyExportBucket,
} from "./export-weekly";

let nextProjectId = 1;

const project = (name: string, date = "2026-11-09") => ({
  runrunit_project_id: nextProjectId++,
  project: { project_name: name, client_name: `Cliente ${name}`, desired_delivery_date: date },
});

const demand = (name: string, date = "2026-11-12") => ({
  key: `demand:${name}`,
  demand: {
    id: name,
    name,
    client_name: `Cliente ${name}`,
    desired_date: date,
    description: `${name}\nlinha 2`,
  },
});

describe("exportação do planejamento semanal", () => {
  it("usa as colunas do relatório semanal", () => {
    expect(buildWeeklyExportRows([])[0]).toEqual([
      "Semana de alocação",
      "Data de entrega desejada",
      "Nome do projeto",
      "Cliente",
      "Classificação",
      "Observação",
    ]);
  });

  it("preserva a ordem das semanas e dos cards exatamente como recebida", () => {
    const buckets: WeeklyExportBucket[] = [
      { label: "Backlog", cards: [project("Zeta"), project("Alfa")] },
      { label: "Semana 1 (02/11 a 06/11)", cards: [project("Beta")] },
      { label: "Semana 2 (09/11 a 13/11)", cards: [project("Gama"), project("Delta")] },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows.slice(1).map((r) => [r[0], r[2]])).toEqual([
      ["Backlog", "Zeta"],
      ["Backlog", "Alfa"],
      ["Semana 1 (02/11 a 06/11)", "Beta"],
      ["Semana 2 (09/11 a 13/11)", "Gama"],
      ["Semana 2 (09/11 a 13/11)", "Delta"],
    ]);
  });

  it("inclui observação preservando quebras de linha e deixa vazia quando ausente", () => {
    const buckets: WeeklyExportBucket[] = [
      {
        label: "Semana 1",
        cards: [
          { ...project("Com nota"), internal_note: "Linha 1\nLinha 2" },
          { ...project("Sem nota") },
          { ...project("Em branco"), internal_note: "  \n " },
        ],
      },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows[1][5]).toBe("Linha 1\nLinha 2");
    expect(rows[2][5]).toBe("");
    expect(rows[3][5]).toBe("");
  });

  it("inclui a classificação atual do card do projeto", () => {
    const buckets: WeeklyExportBucket[] = [
      {
        label: "Semana 1",
        cards: [
          { ...project("TEC e GEO"), card: { is_tec: true, is_geo: true } },
          { ...project("REV"), is_rev: true },
          { ...project("Sem classificação"), card: { is_tec: false, is_geo: false } },
        ],
      },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows.slice(1).map((r) => r[4])).toEqual(["TEC, GEO", "REV", ""]);
  });

  it("inclui a classificação das demandas avulsas quando disponível", () => {
    const buckets: WeeklyExportBucket[] = [
      {
        label: "Semana 1",
        cards: [],
        demands: [
          {
            key: "demand:com-classificacao",
            classification: "TEC, CAM",
            demand: { id: "1", name: "Com classificação", desired_date: "2026-11-12" },
          },
          {
            key: "demand:com-siglas",
            demand: {
              id: "2",
              name: "Com siglas",
              desired_date: "2026-11-12",
              is_geo: true,
              is_rev: true,
            },
          },
          {
            key: "demand:sem-classificacao",
            demand: { id: "3", name: "Sem classificação", desired_date: "2026-11-12" },
          },
        ],
      },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows.slice(1).map((r) => r[4])).toEqual(["TEC, CAM", "GEO, REV", ""]);
  });

  it("acrescenta demandas avulsas depois dos projetos da mesma semana", () => {
    const buckets: WeeklyExportBucket[] = [
      { label: "Semana 1", cards: [project("Projeto")], demands: [demand("Avulsa")] },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows.slice(1).map((r) => [r[0], r[2]])).toEqual([
      ["Semana 1", "Projeto"],
      ["Semana 1", "Avulsa"],
    ]);
    expect(rows[2][5]).toBe("Avulsa\nlinha 2");
  });

  it("não duplica registros repetidos entre semanas", () => {
    const repeated = project("Repetido");
    const repeatedDemand = demand("Avulsa repetida");
    const buckets: WeeklyExportBucket[] = [
      { label: "Semana 1", cards: [repeated], demands: [repeatedDemand] },
      { label: "Semana 2", cards: [repeated], demands: [repeatedDemand] },
    ];
    const rows = buildWeeklyExportRows(buckets);
    expect(rows.filter((r) => r[2] === "Repetido")).toHaveLength(1);
    expect(rows.filter((r) => r[2] === "Avulsa repetida")).toHaveLength(1);
  });

  it("gera nome de arquivo próprio do relatório semanal", () => {
    expect(weeklyExportFileName("Ana", "Novembro/2026")).toBe(
      "planejamento-semanal_Ana Novembro-2026.xlsx",
    );
  });
});
