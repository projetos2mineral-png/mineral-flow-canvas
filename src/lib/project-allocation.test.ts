import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Banco falso em memória com as tabelas usadas pela alocação automática.
 * Suporta: select/eq/is/in/maybeSingle/update/insert e `functions.invoke`.
 */
type AnyRow = Record<string, unknown>;
const db: {
  tables: Record<string, AnyRow[]>;
  syncFails: boolean;
  syncCalls: number;
} = { tables: {}, syncFails: false, syncCalls: 0 };

function table(name: string) {
  let patch: AnyRow | null = null;
  let insertRow: AnyRow | null = null;
  const filters: ((r: AnyRow) => boolean)[] = [];
  const rows = () => db.tables[name] ?? (db.tables[name] = []);
  const match = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (insertRow) {
      rows().push({ id: `new-${rows().length + 1}`, ...insertRow });
      return { data: null, error: null };
    }
    const m = match();
    if (patch) m.forEach((r) => Object.assign(r, patch));
    return { data: m.map((r) => ({ ...r })), error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake encadeável do cliente
  const q: any = {
    select: () => q,
    update: (p: AnyRow) => ((patch = p), q),
    insert: (r: AnyRow) => ((insertRow = r), q),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
    range: () => q,
    async maybeSingle() {
      return { data: match()[0] ?? null, error: null };
    },
    then: (res: (v: unknown) => void) => res(run()),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (n: string) => table(n),
    functions: {
      invoke: async () => {
        db.syncCalls++;
        return db.syncFails
          ? { data: null, error: { message: "HTTP 429" } }
          : { data: { success: true }, error: null };
      },
    },
  },
}));

import {
  allocateProjectToMonthlyLanes,
  allocateManyProjects,
  syncAndAllocateProject,
  targetLaneTitleFor,
} from "./projects";
import { positionPatch } from "./dashboard";

const card = (pid: number, who = "Laura") =>
  db.tables.dashboard_project_cards.find((c) => c.runrunit_project_id === pid && c.assignee_name === who);

beforeEach(() => {
  db.syncFails = false;
  db.syncCalls = 0;
  db.tables = {
    runrunit_projects: [
      { runrunit_project_id: 1, desired_delivery_date: "2026-11-17", is_open: true },
      { runrunit_project_id: 2, desired_delivery_date: "2026-11-17", is_open: true },
    ],
    runrunit_project_people: [
      { runrunit_project_id: 1, assignee_name: "Laura" },
      { runrunit_project_id: 2, assignee_name: "Laura" },
    ],
    dashboard_board_settings: [],
    dashboard_lanes: [
      { id: "out", assignee_name: "Laura", title: "Outubro/2026" },
      { id: "nov", assignee_name: "Laura", title: "Novembro/2026" },
      { id: "dez", assignee_name: "Laura", title: "Dezembro/2026" },
    ],
    dashboard_project_cards: [],
  };
});

describe("responsáveis sem runrunit_project_people", () => {
  it("usa o responsável do próprio card quando a tabela de pessoas está vazia", async () => {
    db.tables.runrunit_project_people = [];
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: true });
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.reason).toBe("alocar");
    expect(card(1)?.lane_id).toBe("nov");
  });
});

describe("alocação automática em fila mensal", () => {
  it("1. card sem fila marcado como manual vai para Novembro/2026", async () => {
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: true });
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.applied).toBe(true);
    expect(card(1)?.lane_id).toBe("nov");
    expect(card(1)?.manually_positioned).toBe(false);
  });

  it("2. card sem fila não manual vai para Novembro/2026", async () => {
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: false });
    await allocateProjectToMonthlyLanes(1);
    expect(card(1)?.lane_id).toBe("nov");
  });

  it("3. card colocado manualmente em Dezembro/2026 continua em Dezembro", async () => {
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: "dez", manually_positioned: true });
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.reason).toBe("ja_alocado");
    expect(card(1)?.lane_id).toBe("dez");
  });

  it("4. sem a fila Novembro/2026 no quadro, o card fica sem fila e nenhuma fila é criada", async () => {
    db.tables.dashboard_lanes = db.tables.dashboard_lanes.filter((l) => l.id !== "nov");
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: true });
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.reason).toBe("sem_fila_mensal");
    expect(card(1)?.lane_id).toBeNull();
    expect(db.tables.dashboard_lanes).toHaveLength(2);
  });

  it("5. projeto sem responsável é ignorado sem erro", async () => {
    db.tables.runrunit_project_people = [];
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.reason).toBe("sem_responsavel");
    expect(db.tables.dashboard_project_cards).toHaveLength(0);
  });

  it("6. falha na sincronização ainda aloca com os dados locais", async () => {
    db.syncFails = true;
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: true });
    const r = await syncAndAllocateProject(1);
    expect(r.syncError).not.toBeNull();
    expect(card(1)?.lane_id).toBe("nov");
  });

  it("7. entrega em 17/11/2026 com 30 dias de antecedência vai para Outubro/2026", async () => {
    expect(targetLaneTitleFor("2026-11-17", 30)).toBe("Outubro/2026");
    expect(targetLaneTitleFor("2026-11-17", 15)).toBe("Novembro/2026");
    db.tables.dashboard_board_settings.push({ assignee_name: "Laura", antecedence_days: 30 });
    await allocateProjectToMonthlyLanes(1);
    expect(card(1)?.lane_id).toBe("out");
  });

  it("8. a fila gravada é a lida depois (recarga) e repetir não duplica nem move", async () => {
    await allocateProjectToMonthlyLanes(1);
    card(1)!.lane_id = "dez"; // usuário move depois
    const [o] = await allocateProjectToMonthlyLanes(1);
    expect(o.reason).toBe("ja_alocado");
    expect(db.tables.dashboard_project_cards).toHaveLength(1);
    expect(card(1)?.lane_id).toBe("dez");
  });

  it("10. lote e individual gravam o mesmo destino", async () => {
    await syncAndAllocateProject(1);
    await allocateManyProjects([2]);
    expect(card(1)?.lane_id).toBe("nov");
    expect(card(2)?.lane_id).toBe(card(1)?.lane_id);
  });

  it("prévia não grava nada", async () => {
    db.tables.dashboard_project_cards.push({ id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, manually_positioned: true });
    const [o] = await allocateProjectToMonthlyLanes(1, { dryRun: true });
    expect(o.reason).toBe("alocar");
    expect(o.target_lane_title).toBe("Novembro/2026");
    expect(card(1)?.lane_id).toBeNull();
  });
});

describe("9. reordenação no Kanban", () => {
  it("vizinho reindexado não é marcado como manual; card arrastado é", () => {
    const now = "2026-10-29T00:00:00Z";
    const neighbor = positionPatch({ id: "v", runrunit_project_id: 3, assignee_name: "Laura", lane_id: "nov", position: 2 }, now);
    const dragged = positionPatch(
      { id: "d", runrunit_project_id: 4, assignee_name: "Laura", lane_id: "nov", position: 0, manually_positioned: true },
      now,
    );
    expect("manually_positioned" in neighbor).toBe(false);
    expect(dragged.manually_positioned).toBe(true);
  });
});

import { isCardOrphan as orphan } from "./projects";
describe("isCardOrphan (por responsável)", () => {
  const owners = new Map([["laneLauraNov", "Laura Fernandes"], ["laneCarlos", "Carlos"]]);
  it("card sem fila é órfão", () => {
    expect(orphan({ assignee_name: "Laura Fernandes", lane_id: null }, owners)).toBe(true);
  });
  it("card com fila de outro responsável é órfão", () => {
    expect(orphan({ assignee_name: "Laura Fernandes", lane_id: "laneCarlos" }, owners)).toBe(true);
  });
  it("card com fila excluída é órfão", () => {
    expect(orphan({ assignee_name: "Laura Fernandes", lane_id: "sumiu" }, owners)).toBe(true);
  });
  it("card na própria fila não é órfão", () => {
    expect(orphan({ assignee_name: "Laura Fernandes", lane_id: "laneLauraNov" }, owners)).toBe(false);
  });
});
