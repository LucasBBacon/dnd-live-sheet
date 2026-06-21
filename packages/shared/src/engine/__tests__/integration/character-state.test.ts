import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ModifierSchema } from "../../../schemas/character.js";
import { createTestModifier } from "../fixtures/modifiers.js";
import { calculateArmorClass, calculateMaxHp } from "../../combat.js";
import { calculateProficiencyScore } from "../../core.js";

type Modifier = z.infer<typeof ModifierSchema>;

describe("engine integration scenarios", () => {
  it("combines dex cap and AC modifiers into final armor class", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "ac", value: 1, sourceId: "scenario" }),
      createTestModifier({ target: "ac", value: 2, sourceId: "scenario" }),
      createTestModifier({ target: "hp_max", value: 3, sourceId: "scenario" }),
    ];

    const ac = calculateArmorClass(14, 18, modifiers, true, 2);
    expect(ac).toBe(19);
  });

  it("combines con penalties, level floor, and hp bonuses in a full hp flow", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "hp_max", value: 4, sourceId: "scenario" }),
      createTestModifier({ target: "ac", value: 2, sourceId: "scenario" }),
    ];

    const maxHp = calculateMaxHp(1, 1, 5, [0, 0, 0, 0], modifiers);
    expect(maxHp).toBe(9);
  });

  it("uses proficiency score alongside combat outputs for a coherent snapshot", () => {
    const skillPassive = calculateProficiencyScore(14, true, 5, 0);
    const ac = calculateArmorClass(12, 14, [], true, null);
    const maxHp = calculateMaxHp(10, 14, 3, [5, 6], []);

    expect(skillPassive).toBe(15);
    expect(ac).toBe(14);
    expect(maxHp).toBe(21);
  });
});
