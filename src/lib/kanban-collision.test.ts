import { describe, it, expect } from "vitest";
import { kanbanCollisionDetection } from "./kanban-dnd";

/**
 * Simula o quadro: "Sem fila" (x 0–200) e "Novembro/2026" (x 300–500).
 * A fila "Sem fila" tem um card oculto pela rolagem (y 900+), fora da área visível.
 */
type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };
const r = (left: number, top: number, w: number, h: number): Rect => ({
  left, top, width: w, height: h, right: left + w, bottom: top + h,
});

const UN = "__unassigned__";
const NOV = "nov-2026";
const rects = new Map<string, Rect>([
  [`lane:${UN}`, r(0, 100, 200, 600)],
  [`lane:${NOV}`, r(300, 100, 200, 600)],
  [`laneItem:${NOV}`, r(290, 40, 220, 680)], // coluna inteira (com cabeçalho)
  ["active", r(10, 110, 180, 170)],
  ["un-card", r(10, 300, 180, 170)],
  ["un-hidden", r(310, 900, 180, 170)], // overflow oculto, rect "vaza" sob outra coluna
  ["nov-card", r(310, 110, 180, 170)],
]);
const body: Record<string, string> = {
  active: `lane:${UN}`,
  "un-card": `lane:${UN}`,
  "un-hidden": `lane:${UN}`,
  "nov-card": `lane:${NOV}`,
};
const containers = [...rects.keys()].map((id) => ({
  id,
  data: { current: body[id] ? { sortable: { containerId: body[id] } } : {} },
}));

function hit(x: number, y: number, activeId = "active"): string | null {
  const res = kanbanCollisionDetection({
    active: { id: activeId } as never,
    collisionRect: r(x - 5, y - 5, 10, 10) as never,
    droppableRects: rects as never,
    droppableContainers: containers as never,
    pointerCoordinates: { x, y },
  });
  return res[0] ? String(res[0].id) : null;
}

describe("kanbanCollisionDetection (arraste de card)", () => {
  it("soltar sobre um card de novembro aponta para esse card", () => {
    expect(hit(400, 200)).toBe("nov-card");
  });
  it("soltar no corpo vazio de novembro aponta para a fila", () => {
    expect(hit(400, 600)).toBe(`lane:${NOV}`);
  });
  it("soltar no cabeçalho/borda de novembro aponta para a coluna", () => {
    expect(hit(400, 60)).toBe(`laneItem:${NOV}`);
    expect(hit(295, 400)).toBe(`laneItem:${NOV}`);
  });
  it("card oculto pela rolagem de 'Sem fila' nunca é destino", () => {
    expect(hit(400, 950)).not.toBe("un-hidden");
  });
  it("soltura fora de qualquer fila não tem destino (cancela)", () => {
    expect(hit(1000, 1000)).toBeNull();
  });
  it("o próprio card arrastado não é destino", () => {
    expect(hit(100, 150)).toBe(`lane:${UN}`);
  });
  it("soltura intencional em 'Sem fila' continua funcionando", () => {
    expect(hit(100, 350)).toBe("un-card");
  });
});
