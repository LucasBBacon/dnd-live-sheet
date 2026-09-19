import { describe, expect, it } from "vitest";
import type { ActionGrant } from "@project/shared";
import { corePackLookup } from "../../pipeline/__tests__/corePackFixture.js";
import { RELENTLESS_RAGE_ACTION_ID, RelentlessRageEngine } from "../relentlessRage.js";

const relentlessRage = (): ActionGrant => {
  const action = corePackLookup()
    .traitsById?.["trait_relentless_rage"]?.actions.find(
      (entry) => entry.id === RELENTLESS_RAGE_ACTION_ID,
    );
  if (!action) throw new Error("action_relentless_rage missing from the shipped pack");
  return action;
};

const describeAt = (currentHp: number, activeStates: string[], usesSinceRest = 0) =>
  RelentlessRageEngine.describe({
    currentHp,
    activeStates,
    action: relentlessRage(),
    usesSinceRest,
  });

describe("RelentlessRageEngine.describe", () => {
  it("offers the save at 0 hit points while raging", () => {
    expect(describeAt(0, ["status_raging"])).toMatchObject({ available: true, dc: 10 });
  });

  it("does not offer it above 0 hit points", () => {
    expect(describeAt(1, ["status_raging"]).available).toBe(false);
  });

  it("does not offer it at 0 hit points without rage", () => {
    expect(describeAt(0, []).available).toBe(false);
  });

  it("raises the DC by 5 for each use since the last rest", () => {
    expect(describeAt(0, ["status_raging"], 2).dc).toBe(20);
  });

  it("says what the save is for, in the player's words", () => {
    expect(describeAt(10, [], 1).summary).toBe(
      "Drop to 0 hit points while raging: DC 15 Constitution saving throw to drop to 1 instead.",
    );
  });

  it("refuses an action that is not a self-save", () => {
    expect(() =>
      RelentlessRageEngine.describe({
        currentHp: 0,
        activeStates: [],
        action: {
          id: "action_dodge",
          name: "Dodge",
          activation: "action",
          effect: { type: "no_effect" },
        } as ActionGrant,
        usesSinceRest: 0,
      }),
    ).toThrow("action_dodge is not a self_save action");
  });
});
