import { describe, expect, it } from "vitest";
import { RestEngine } from "../rests.js";
import { resolveResourceRule } from "../../rules/ruleLookup.js";
import { getResourceMaxUses } from "../../utils/resourceRules.js";

describe("resource rules", () => {
  it("evaluates fighter resource thresholds declaratively", () => {
    expect(
      getResourceMaxUses(
        resolveResourceRule("trait_action_surge")!,
        2,
        { class_fighter: 1 },
      ),
    ).toBe(0);

    expect(
      getResourceMaxUses(
        resolveResourceRule("trait_action_surge")!,
        2,
        { class_fighter: 2 },
      ),
    ).toBe(1);

    expect(
      getResourceMaxUses(
        resolveResourceRule("trait_action_surge")!,
        17,
        { class_fighter: 17 },
      ),
    ).toBe(2);
  });

  it("restores short-rest and half-on-long-rest resources", () => {
    const resources = [
      { id: "trait_action_surge", current: 0 },
      { id: "custom_hit_dice", current: 0 },
    ];

    const recoveredOnShortRest = RestEngine.applyRest(
      resources,
      "short",
      4,
      { class_fighter: 4 },
    );

    expect(recoveredOnShortRest[0]).toEqual({
      id: "trait_action_surge",
      current: 1,
    });
    expect(recoveredOnShortRest[1]).toEqual({
      id: "custom_hit_dice",
      current: 0,
    });

    const recoveredOnLongRest = RestEngine.applyRest(
      [{ id: "trait_action_surge", current: 0 }],
      "long",
      17,
      { class_fighter: 17 },
    );

    expect(recoveredOnLongRest[0]).toEqual({
      id: "trait_action_surge",
      current: 2,
    });
  });
});