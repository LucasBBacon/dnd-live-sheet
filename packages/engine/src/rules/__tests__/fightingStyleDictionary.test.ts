import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const FIGHTING_STYLE_TRAITS = corePackSnapshot().traitsById;

describe("the pack's fighting styles", () => {
  it("classifies Protection as a manual sheet helper until target-aware reactions exist", () => {
    const protection = FIGHTING_STYLE_TRAITS.trait_fs_protection;

    expect(protection).toBeDefined();
    expect(protection?.implementation).toEqual({
      mode: "manual_sheet_helper",
      summary:
        "Phase 1 keeps Protection as a sheet-level reaction helper for tabletop play rather than forcing a target-aware enemy model into the engine.",
      blockedBy: ["other_creature_attack_roll_targeting"],
    });
    expect(protection?.modifiers.fixed).toEqual([]);
    expect(protection?.triggers).toEqual([]);
    expect(protection?.actions).toEqual([]);
    expect(protection?.diceRules).toEqual([]);
  });
});
