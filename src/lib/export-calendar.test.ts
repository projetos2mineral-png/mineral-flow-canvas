import { describe, it, expect } from "vitest";
import { buildCalendarExportRows } from "./export-projects";

describe("buildCalendarExportRows", () => {
  it("mantém data desejada e manual separadas em dd/mm/aaaa, vazios em branco e ordem", () => {
    const rows = buildCalendarExportRows([
      { project_name: "A", client_name: "C1", project_group_name: "G", desired_delivery_date: "2026-11-09", planning_date: "2026-11-20" },
      { project_name: "B", client_name: null, project_group_name: null, desired_delivery_date: "2026-11-01", planning_date: null },
    ]);
    expect(rows[0]).toEqual(["Nome do projeto/card", "Cliente", "Grupo", "Data desejada", "Data manual"]);
    expect(rows[1]).toEqual(["A", "C1", "G", "09/11/2026", "20/11/2026"]);
    expect(rows[2]).toEqual(["B", "", "", "01/11/2026", ""]);
  });
});
