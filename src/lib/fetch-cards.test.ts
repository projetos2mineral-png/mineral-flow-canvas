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

const state = { flagsCalls: 0 };

function primaryQuery() {
  return {
    select: () => primaryQuery(),
    range: async () => ({ data: [primaryCard], error: null }),
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
    expect(errorSpy).toHaveBeenCalledWith(
      "[dashboard] fetchCards complementary flags query failed",
      expect.objectContaining(flagsError),
    );

    errorSpy.mockRestore();
  });
});
