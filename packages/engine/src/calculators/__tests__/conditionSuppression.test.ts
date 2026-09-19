import { describe, expect, it } from "vitest";
import { suppressConditions } from "../conditionSuppression.js";

describe("suppressConditions", () => {
  const suppressions = [
    {
      condition: "frightened",
      requiredStates: ["status_raging"],
      forbiddenStates: [],
      source: "Mindless Rage",
    },
  ];

  it("keeps the condition toggled but removes it from active states", () => {
    expect(
      suppressConditions(["frightened", "prone"], suppressions, ["status_raging"]),
    ).toEqual({
      active: ["prone"],
      suspended: [{ condition: "frightened", source: "Mindless Rage" }],
    });
  });

  it("does not suppress without its gating state", () => {
    expect(suppressConditions(["frightened"], suppressions, [])).toEqual({
      active: ["frightened"],
      suspended: [],
    });
  });
});