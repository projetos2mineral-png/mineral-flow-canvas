import { beforeEach, describe, expect, it, vi } from "vitest";

const primaryCard = {
  id: "5cd68712-432b-4fa5-be8f-acd06bbdf84d",
  runrunit_project_id: 3733527,
  assignee_name: "Laura Fernandes",
  lane_id: "68b6406b-36b1-4f84-aa56-edb0d8abedac",
  status: "a iniciar",
  position: 0,
  internal_note: "preservada",
  review_status: "não enviado",
  review_requested_by: null,
  review_requested_to: null,
  correction_note: null,
  manually_positioned: true,
  total_tasks: 2,
  total_estimated_hours: 0.95,
  calculation_details: [{ origem: "responsavel_tipo" }],
  updated_by: "Lucas",
  updated_at: "2026-10-29T20:55:12.907+00:00",
};

const flagsError = {
  code: "42501",
  message: "permission denied for table dashboard_project_cards",
  details: "authenticated role is not allowed to read the table",
};

const state = {
  flagsCalls: 0,
  primaryRows: [primaryCard],
  orderCalls: [] as { column: string; ascending: boolean }[],
  ranges: [] as { from: number; to: number }[],
};

function primaryQuery() {
  return {
    select: () => primaryQuery(),
    order: (column: string, options: { ascending: boolean }) => {
      state.orderCalls.push({ column, ascending: options.ascending });
      return primaryQuery();
    },
    range: async (from: number, to: number) => {
      state.ranges.push({ from, to });
      const rows = [...state.primaryRows].sort((a, b) => a.id.localeCompare(b.id));
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
}

function flagsQuery() {
  return {
    in: async () => {
      state.flagsCalls += 1;
      return { data: null, error: flagsError };
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return table === "dashboard_cards_with_estimates" ? primaryQuery() : {
        select: () => flagsQuery(),
      };
    },
  },
}));

import { fetchCards } from "./dashboard";

describe("fetchCards", () => {
  beforeEach(() => {
    state.flagsCalls = 0;
    state.primaryRows = [primaryCard];
    state.orderCalls = [];
    state.ranges = [];
  });

  it("preserva cards da view quando a consulta complementar falha", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const cards = await fetchCards();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: primaryCard.id,
      runrunit_project_id: 3733527,
      lane_id: primaryCard.lane_id,
      internal_note: "preservada",
      is_tec: false,
      is_geo: false,
      manual_estimated_hours: null,
      total_estimated_hours: 0.95,
    });
    expect(state.flagsCalls).toBe(1);
    expect(state.orderCalls).toEqual([{ column: "id", ascending: true }]);
    expect(state.ranges).toEqual([{ from: 0, to: 999 }]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[dashboard] fetchCards complementary flags query failed",
      expect.objectContaining(flagsError),
    );

    errorSpy.mockRestore();
  });

  it("pagina sem duplicar ou omitir cards acima de 2.000 registros", async () => {
    const targetId = primaryCard.id;
    state.primaryRows = Array.from({ length: 2199 }, (_, index) => ({
      ...primaryCard,
      id: index === 1234 ? targetId : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      runrunit_project_id: index === 1234 ? 3733527 : index + 1,
      assignee_name: index === 1234 ? "Laura Fernandes" : `Assignee ${index}`,
    }));

    const cards = await fetchCards();
    const ids = cards.map((card) => card.id);

    expect(cards).toHaveLength(2199);
    expect(new Set(ids).size).toBe(2199);
    expect(ids).toContain(targetId);
    expect(cards.find((card) => card.id === targetId)).toMatchObject({
      runrunit_project_id: 3733527,
      assignee_name: "Laura Fernandes",
      lane_id: primaryCard.lane_id,
    });
    expect(state.orderCalls).toEqual([
      { column: "id", ascending: true },
      { column: "id", ascending: true },
      { column: "id", ascending: true },
    ]);
    expect(state.ranges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
  });
});
