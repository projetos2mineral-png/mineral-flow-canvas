import { describe, it, expect } from "vitest";
import { resolveCardDropLane, isLaneLevelTarget, isLaneItemId } from "./kanban-dnd";

const laneOfCard = (k: string) => (k === "card-1" ? "lane-A" : null);

describe("kanban-dnd", () => {
  it("card solto sobre a coluna (laneItem) vai para a fila da coluna", () => {
    expect(resolveCardDropLane("laneItem:lane-B", laneOfCard)).toBe("lane-B");
  });
  it("card solto sobre o corpo da fila vai para essa fila", () => {
    expect(resolveCardDropLane("lane:lane-C", laneOfCard)).toBe("lane-C");
  });
  it("card solto sobre outro card vai para a fila desse card", () => {
    expect(resolveCardDropLane("card-1", laneOfCard)).toBe("lane-A");
  });
  it("soltar sobre coluna/corpo anexa ao final; sobre card não", () => {
    expect(isLaneLevelTarget("laneItem:x")).toBe(true);
    expect(isLaneLevelTarget("lane:x")).toBe(true);
    expect(isLaneLevelTarget("card-1")).toBe(false);
  });
  it("identifica arraste de coluna", () => {
    expect(isLaneItemId("laneItem:x")).toBe(true);
    expect(isLaneItemId("card-1")).toBe(false);
  });
});
