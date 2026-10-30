import { describe, expect, it } from "vitest";
import {
  laneBelongsToAssignee,
  filterByAssignee,
  normalizeAssigneeName,
  sameAssigneeName,
  resolveCardLane,
  type Lane,
} from "@/lib/dashboard";

const lauraLane: Lane = {
  id: "68b6406b-36b1-4f84-aa56-edb0d8abedac",
  assignee_name: " Laura   Fernandes ",
  title: "Novembro/2026",
  position: 0,
};

describe("normalização e associação de filas", () => {
  it("normaliza espaços externos, internos e capitalização", () => {
    expect(normalizeAssigneeName("  LAURA   Fernandes  ")).toBe("laura fernandes");
    expect(sameAssigneeName("  Laura   Fernandes ", "laura fernandes")).toBe(true);
  });

  it("reconhece a fila da Laura no caso de referência", () => {
    expect(laneBelongsToAssignee(lauraLane, "Laura Fernandes")).toBe(true);
    expect(
      resolveCardLane(
        {
          lane_id: "68b6406b-36b1-4f84-aa56-edb0d8abedac",
          assignee_name: "Laura Fernandes",
        },
        [lauraLane],
        "Laura Fernandes",
      ),
    ).toMatchObject({ id: "68b6406b-36b1-4f84-aa56-edb0d8abedac", title: "Novembro/2026" });
  });

  it("não associa a fila a outro responsável", () => {
    expect(laneBelongsToAssignee(lauraLane, "Lucas Fernandes")).toBe(false);
    expect(laneBelongsToAssignee(lauraLane, "")).toBe(false);
  });

  it("mantém cards da Laura e exclui cards de outros responsáveis", () => {
    const rows = filterByAssignee(
      [
        { id: "5cd68712-432b-4fa5-be8f-acd06bbdf84d", assignee_name: "Laura Fernandes" },
        { id: "other", assignee_name: "Laura  Fernandes" },
        { id: "foreign", assignee_name: "Carlos" },
      ],
      " LAURA Fernandes ",
    );

    expect(rows.map((row) => row.id)).toEqual([
      "5cd68712-432b-4fa5-be8f-acd06bbdf84d",
      "other",
    ]);
  });

  it("não modifica o texto original da fila", () => {
    expect(lauraLane.assignee_name).toBe(" Laura   Fernandes ");
  });
});
