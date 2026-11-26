import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banco falso em memória para validar o checklist genérico:
 * os itens são compartilhados pela demanda, mas cada responsável persiste
 * as suas próprias marcações na sua linha.
 */
type DemandRow = {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  checklist_items: string[];
  desired_date: string;
  is_visible_on_dashboard: boolean;
  status: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssigneeRow = {
  id: string;
  demand_id: string;
  assignee_name: string | null;
  estimated_hours: number;
  lane_id: string | null;
  manually_positioned: boolean;
  checklist_selections: string[];
};

const DEMANDS = "dashboard_manual_demands";
const ASSIGNEES = "dashboard_manual_demand_assignees";

const db: { demands: DemandRow[]; assignees: AssigneeRow[] } = { demands: [], assignees: [] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake encadeável do cliente Supabase
function query(table: string): any {
  let operation: "select" | "update" | "delete" | "insert" | null = null;
  let columns = "";
  let patch: Record<string, unknown> = {};
  let inserted: Record<string, unknown>[] = [];
  const filters: [string, unknown][] = [];

  const matching = () => {
    const rows = table === DEMANDS ? db.demands : db.assignees;
    return (rows as unknown as Record<string, unknown>[]).filter((r) =>
      filters.every(([k, v]) => r[k] === v),
    );
  };

  const execute = () => {
    if (operation === "update") {
      const rows = matching();
      rows.forEach((r) => Object.assign(r, patch));
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (operation === "delete") {
      const rows = matching();
      const ids = new Set(rows.map((r) => r.id));
      if (table === DEMANDS) db.demands = db.demands.filter((d) => !ids.has(d.id));
      else db.assignees = db.assignees.filter((a) => !ids.has(a.id));
      return { data: [], error: null };
    }
    if (operation === "insert") {
      const target = table === DEMANDS ? db.demands : db.assignees;
      inserted.forEach((row) => target.push({ ...row } as never));
      return { data: inserted, error: null };
    }

    const rows = matching();
    if (table === DEMANDS && columns.includes(`${ASSIGNEES}(`)) {
      return {
        data: rows.map((r) => ({
          ...r,
          [ASSIGNEES]: db.assignees.filter((a) => a.demand_id === r.id).map((a) => ({ ...a })),
        })),
        error: null,
      };
    }
    if (columns === "id,checklist_items") {
      return {
        data: rows.map((r) => ({ id: r.id, checklist_items: r.checklist_items })),
        error: null,
      };
    }
    if (columns === "id,checklist_selections") {
      return {
        data: rows.map((r) => ({ id: r.id, checklist_selections: r.checklist_selections })),
        error: null,
      };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- encadeamento parcial do cliente
  const q: any = {
    select(cols: string) {
      columns = cols;
      // Em `.update(...).select(...)`, o select apenas pede o retorno da linha.
      if (!operation) operation = "select";
      return q;
    },
    update(p: Record<string, unknown>) {
      operation = "update";
      patch = p;
      return q;
    },
    delete() {
      operation = "delete";
      return q;
    },
    insert(rows: Record<string, unknown>[]) {
      operation = "insert";
      inserted = rows;
      return q;
    },
    eq(key: string, value: unknown) {
      filters.push([key, value]);
      return q;
    },
    order() {
      return q;
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(execute()).then(resolve);
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => query(table) },
}));

import {
  fetchManualDemands,
  removeChecklistSelectionsForDemand,
  renameChecklistSelectionsForDemand,
  updateDemandAssigneeChecklistSelections,
  updateDemandChecklist,
} from "./manual-demands";

beforeEach(() => {
  db.demands = [
    {
      id: "d1",
      name: "Demanda compartilhada",
      description: null,
      client_name: null,
      checklist_items: ["Item A", "Item B"],
      desired_date: "2026-11-26",
      is_visible_on_dashboard: true,
      status: "Ativa",
      created_by: null,
      created_at: null,
      updated_at: null,
    },
  ];
  db.assignees = [
    {
      id: "a-caio",
      demand_id: "d1",
      assignee_name: "Caio",
      estimated_hours: 4,
      lane_id: null,
      manually_positioned: false,
      checklist_selections: ["Item A"],
    },
    {
      id: "a-laura",
      demand_id: "d1",
      assignee_name: "Laura",
      estimated_hours: 4,
      lane_id: null,
      manually_positioned: false,
      checklist_selections: ["Item B"],
    },
  ];
});

describe("checklist genérico de demandas avulsas", () => {
  it("carrega os itens compartilhados e as marcações de cada responsável", async () => {
    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.checklist_items).toEqual(["Item A", "Item B"]);
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      ["Item A"],
    );
    expect(
      demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_selections,
    ).toEqual(["Item B"]);
  });

  it("cria um item novo e o marca somente para Caio", async () => {
    await fetchManualDemands();
    await updateDemandChecklist("d1", ["Item A", "Item B", "Item C"]);
    await updateDemandAssigneeChecklistSelections("a-caio", ["Item A", "Item C"]);

    // Nova leitura = fechar e reabrir o modal.
    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.checklist_items).toEqual(["Item A", "Item B", "Item C"]);
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      ["Item A", "Item C"],
    );
    expect(
      demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_selections,
    ).toEqual(["Item B"]);
  });

  it("edita um item preservando a marcação individual de cada responsável", async () => {
    await fetchManualDemands();
    await updateDemandChecklist("d1", ["Item A renomeado", "Item B"]);
    await renameChecklistSelectionsForDemand("d1", "Item A", "Item A renomeado");

    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.checklist_items).toEqual(["Item A renomeado", "Item B"]);
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      ["Item A renomeado"],
    );
    expect(
      demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_selections,
    ).toEqual(["Item B"]);
  });

  it("exclui um item e remove a marcação sem afetar os demais responsáveis", async () => {
    await fetchManualDemands();
    await updateDemandChecklist("d1", ["Item B"]);
    await removeChecklistSelectionsForDemand("d1", "Item A");

    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.checklist_items).toEqual(["Item B"]);
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      [],
    );
    expect(
      demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_selections,
    ).toEqual(["Item B"]);
  });
});
