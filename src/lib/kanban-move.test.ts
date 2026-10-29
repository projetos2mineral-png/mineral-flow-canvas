import { describe, it, expect } from "vitest";
import { resolveCardDropTarget, planCardMove, type MovableCard } from "./kanban-dnd";

const U = "__unassigned__";
type C = MovableCard;
const card = (key: string, lane_id: string | null, position: number): C => ({
  key,
  lane_id,
  position,
  hasRow: true,
});

// Quadro: Sem fila = [a, b]; Nov = [n1, n2]; Dez = []
const lanes = new Set(["nov", "dez"]);
const where: Record<string, string> = { a: U, b: U, n1: "nov", n2: "nov" };
const ctx = {
  unassignedId: U,
  laneExists: (id: string) => lanes.has(id),
  laneOfCard: (k: string) => where[k] ?? null,
};
const board: Record<string, C[]> = {
  [U]: [card("a", null, 0), card("b", null, 1)],
  nov: [card("n1", "nov", 0), card("n2", "nov", 1)],
  dez: [],
};

function move(activeKey: string, overId: string) {
  const target = resolveCardDropTarget(overId, activeKey, ctx);
  if (target.kind === "invalid") return { target, plan: null };
  const from = ctx.laneOfCard(activeKey)!;
  const to = target.kind === "lane" ? target.laneId : U;
  const active = Object.values(board)
    .flat()
    .find((c) => c.key === activeKey)!;
  return {
    target,
    plan: planCardMove({ dest: board[to], active, fromLaneId: from, target, unassignedId: U }),
  };
}

describe("mover card de 'Sem fila' para uma fila", () => {
  it("soltar sobre um card da fila grava o id da fila, antes desse card", () => {
    const { plan } = move("a", "n2");
    expect(plan!.laneValue).toBe("nov");
    expect(plan!.changes[0]).toMatchObject({ item: { key: "a" }, position: 1 });
  });
  it("soltar no cabeçalho da fila grava o id da fila, no fim", () => {
    const { plan } = move("a", "laneItem:nov");
    expect(plan!.laneValue).toBe("nov");
    expect(plan!.changes[0]).toMatchObject({ item: { key: "a" }, position: 2 });
  });
  it("soltar no espaço vazio de uma fila vazia grava o id da fila", () => {
    const { plan } = move("a", "lane:dez");
    expect(plan!.laneValue).toBe("dez");
    expect(plan!.changes).toHaveLength(1);
    expect(plan!.changes[0].position).toBe(0);
  });
});

describe("outras movimentações", () => {
  it("entre filas existentes grava a fila de destino", () => {
    expect(move("n1", "lane:dez").plan!.laneValue).toBe("dez");
  });
  it("retorno intencional para 'Sem fila' grava null", () => {
    const { target, plan } = move("n1", `lane:${U}`);
    expect(target.kind).toBe("unassigned");
    expect(plan!.laneValue).toBeNull();
  });
  it("soltar sobre card de 'Sem fila' também é retorno intencional", () => {
    expect(move("n1", "a").plan!.laneValue).toBeNull();
  });
  it("todos os cards gravados no plano recebem a mesma fila", () => {
    const { plan } = move("a", "n1");
    expect(plan!.changes.every(() => plan!.laneValue === "nov")).toBe(true);
    expect(plan!.changes.map((c) => c.item.key)).toEqual(["a", "n1", "n2"]);
  });
});

describe("destino indeterminado nunca vira 'Sem fila'", () => {
  it("fila inexistente no quadro (ex.: de outro responsável) é inválida", () => {
    expect(resolveCardDropTarget("lane:fila-de-outro", "a", ctx)).toEqual({
      kind: "invalid",
      reason: "unknown-lane",
    });
  });
  it("card desconhecido é inválido", () => {
    expect(resolveCardDropTarget("999", "a", ctx).kind).toBe("invalid");
  });
  it("soltar sobre si mesmo não grava nada", () => {
    expect(resolveCardDropTarget("a", "a", ctx)).toEqual({ kind: "invalid", reason: "self" });
  });
  it("mesma fila e mesma posição não gera gravação", () => {
    expect(move("n2", "lane:nov").plan).toBeNull();
  });
});
