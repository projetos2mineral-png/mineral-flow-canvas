import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Banco falso em memória para `dashboard_project_cards`, simulando o encadeamento
 * do cliente: .from().update().eq().select() / .select().eq().eq().maybeSingle().
 * Permite verificar que o `lane_id` persistido é o solicitado e que uma recarga
 * (nova leitura) devolve o valor gravado.
 */
type Row = { id: string; runrunit_project_id: number; assignee_name: string; lane_id: string | null; position: number };
const db: { rows: Row[]; failWith: string | null } = { rows: [], failWith: null };

function table() {
  let patch: Partial<Row> | null = null;
  const filters: [keyof Row, unknown][] = [];
  const match = () => db.rows.filter((r) => filters.every(([k, v]) => r[k] === v));
  const q: any = {
    update(p: Partial<Row>) { patch = p; return q; },
    select() { return q; },
    eq(k: keyof Row, v: unknown) { filters.push([k, v]); return q; },
    then(res: (v: unknown) => void) {
      if (db.failWith) return res({ data: null, error: { message: db.failWith } });
      const rows = match();
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return res({ data: rows.map((r) => ({ ...r })), error: null });
    },
    async maybeSingle() { return { data: match()[0] ?? null, error: null }; },
    async single() {
      const rows = match();
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return { data: rows[0], error: null };
    },
  };
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => table() } }));

import { bulkUpdateCardPositions } from "./dashboard";

const reload = (pid: number, who: string) =>
  db.rows.find((r) => r.runrunit_project_id === pid && r.assignee_name === who);

beforeEach(() => {
  db.failWith = null;
  db.rows = [
    { id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: null, position: 0 },
    { id: "c2", runrunit_project_id: 1, assignee_name: "Pedro", lane_id: null, position: 0 },
  ];
});

const upd = (o: Partial<Parameters<typeof bulkUpdateCardPositions>[0][number]>) => ({
  id: "c1", runrunit_project_id: 1, assignee_name: "Laura", lane_id: "nov", position: 3, ...o,
});

describe("persistência da movimentação", () => {
  it("de 'Sem fila' para Novembro grava e confirma o lane_id", async () => {
    const r = await bulkUpdateCardPositions([upd({})]);
    expect(r.failed).toBe(0);
    expect(r.confirmed.get(1)?.lane_id).toBe("nov");
    expect(reload(1, "Laura")?.lane_id).toBe("nov"); // recarregamento
  });
  it("retorno intencional para 'Sem fila' grava null", async () => {
    db.rows[0].lane_id = "nov";
    const r = await bulkUpdateCardPositions([upd({ lane_id: null })]);
    expect(r.failed).toBe(0);
    expect(reload(1, "Laura")?.lane_id).toBeNull();
  });
  it("ID da view sem linha física grava pela chave projeto + responsável", async () => {
    const r = await bulkUpdateCardPositions([upd({ id: "id-da-view" })]);
    expect(r.failed).toBe(0);
    expect(reload(1, "Laura")?.lane_id).toBe("nov");
  });
  it("boards de responsáveis diferentes não se misturam", async () => {
    await bulkUpdateCardPositions([upd({ id: "c2", assignee_name: "Pedro", lane_id: "dez" })]);
    expect(reload(1, "Pedro")?.lane_id).toBe("dez");
    expect(reload(1, "Laura")?.lane_id).toBeNull();
  });
  it("erro do banco é exposto com a mensagem real e não é dado como sucesso", async () => {
    db.failWith = "permission denied for table dashboard_project_cards";
    const r = await bulkUpdateCardPositions([upd({})]);
    expect(r.failed).toBe(1);
    expect(r.errors[0].message).toContain("permission denied");
    expect(r.confirmed.size).toBe(0);
  });
});
