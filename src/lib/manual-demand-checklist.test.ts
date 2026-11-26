import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banco falso em memória para validar listas e marcações independentes
 * na linha de cada responsável.
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
  checklist_items: string[];
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
  updateDemandAssigneeChecklistItems,
  updateDemandAssigneeChecklistSelections,
} from "./manual-demands";

beforeEach(() => {
  db.demands = [
    {
      id: "d1",
      name: "Demanda compartilhada",
      description: null,
      client_name: null,
      checklist_items: ["Lista antiga compartilhada"],
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
      id: "a-alessandra",
      demand_id: "d1",
      assignee_name: "Alessandra",
      estimated_hours: 4,
      lane_id: null,
      manually_positioned: false,
      checklist_items: ["Item Alessandra"],
      checklist_selections: ["Item Alessandra"],
    },
    {
      id: "a-caio",
      demand_id: "d1",
      assignee_name: "Caio",
      estimated_hours: 4,
      lane_id: null,
      manually_positioned: false,
      checklist_items: ["Item Caio"],
      checklist_selections: ["Item Caio"],
    },
    {
      id: "a-laura",
      demand_id: "d1",
      assignee_name: "Laura",
      estimated_hours: 4,
      lane_id: null,
      manually_positioned: false,
      checklist_items: ["Item Laura"],
      checklist_selections: ["Item Laura"],
    },
  ];
});

describe("checklists individuais das demandas avulsas", () => {
  it("carrega listas e marcações diferentes para cada responsável", async () => {
    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.checklist_items).toEqual(["Lista antiga compartilhada"]);
    expect(demand?.assignees.find((a) => a.assignee_name === "Alessandra")?.checklist_items).toEqual(
      ["Item Alessandra"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_items).toEqual(
      ["Item Caio"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_items).toEqual(
      ["Item Laura"],
    );
  });

  it("salva e recarrega a lista e as marcações de Caio sem alterar os demais", async () => {
    await fetchManualDemands();
    await updateDemandAssigneeChecklistItems("a-caio", ["Tarefa Caio 1", "Tarefa Caio 2"]);
    await updateDemandAssigneeChecklistSelections("a-caio", ["Tarefa Caio 2"]);

    // Nova leitura = fechar e reabrir o modal de cada responsável.
    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_items).toEqual(
      ["Tarefa Caio 1", "Tarefa Caio 2"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      ["Tarefa Caio 2"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Alessandra")?.checklist_items).toEqual(
      ["Item Alessandra"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_items).toEqual(
      ["Item Laura"],
    );
    expect(demand?.checklist_items).toEqual(["Lista antiga compartilhada"]);
  });

  it("edita ou remove itens e suas marcações somente no card escolhido", async () => {
    await fetchManualDemands();
    await updateDemandAssigneeChecklistItems("a-laura", ["Item Laura renomeado"]);
    await updateDemandAssigneeChecklistSelections("a-laura", ["Item Laura renomeado"]);

    const demand = (await fetchManualDemands()).find((d) => d.id === "d1");
    expect(demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_items).toEqual(
      ["Item Laura renomeado"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Laura")?.checklist_selections).toEqual(
      ["Item Laura renomeado"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Alessandra")?.checklist_selections).toEqual(
      ["Item Alessandra"],
    );
    expect(demand?.assignees.find((a) => a.assignee_name === "Caio")?.checklist_selections).toEqual(
      ["Item Caio"],
    );
  });
});
