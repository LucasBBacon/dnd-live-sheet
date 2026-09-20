import { describe, expect, it } from "vitest";
import type { RuntimeModifier } from "@project/shared";
import type { CastingSource } from "../../rules/casterLevel.js";
import type { Ability } from "../../types/core.js";
import { SpellcastingEngine } from "../spellcasting.js";

const scores: Record<Ability, number> = {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 18,
  WIS: 14,
  CHA: 8,
};

const wizard: CastingSource = {
  classId: "class_wizard",
  level: 5,
  progression: "full",
  ability: "INT",
};

const cleric: CastingSource = {
  classId: "class_cleric",
  level: 3,
  progression: "full",
  ability: "WIS",
};

const modifier = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "SPELLCASTING_MOD",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Source",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

describe("SpellcastingEngine.calculate", () => {
  it("derives the DC and the attack bonus from the class's own ability", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, []);
    if (!result) throw new Error("expected one result for the wizard");

    expect(result.ability).toBe("INT");
    expect(result.modifier).toBe(4);
    expect(result.saveDc).toBe(15); // 8 + 3 + 4
    expect(result.attackBonus).toBe(7); // 3 + 4
    expect(result.breakdown).toContain("INT (+4)");
  });

  it("returns one entry per casting class, each on its own ability", () => {
    const results = SpellcastingEngine.calculate([wizard, cleric], scores, 3, []);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.classId === "class_cleric")?.saveDc).toBe(13);
    expect(results.find((r) => r.classId === "class_wizard")?.saveDc).toBe(15);
  });

  it("applies a SPELLCASTING_MOD modifier to both numbers", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, [
      modifier({ sourceName: "Rod of the Pact Keeper" }),
    ]);
    if (!result) throw new Error("expected one result for the wizard");

    expect(result.saveDc).toBe(16);
    expect(result.attackBonus).toBe(8);
    expect(result.breakdown).toContain("Rod of the Pact Keeper (+1)");
  });

  it("ignores a modifier whose required state is not active", () => {
    const [result] = SpellcastingEngine.calculate(
      [wizard],
      scores,
      3,
      [modifier({ requiredStates: ["raging"] })],
      [],
    );
    if (!result) throw new Error("expected one result for the wizard");

    expect(result.saveDc).toBe(15);
  });

  it("ignores an inactive modifier", () => {
    const [result] = SpellcastingEngine.calculate([wizard], scores, 3, [
      modifier({ isActive: false }),
    ]);
    if (!result) throw new Error("expected one result for the wizard");

    expect(result.saveDc).toBe(15);
  });

  it("reports the pact slot level for a warlock and omits it otherwise", () => {
    const [pact] = SpellcastingEngine.calculate(
      [{ classId: "class_warlock", level: 9, progression: "pact", ability: "CHA" }],
      scores,
      3,
      [],
    );
    if (!pact) throw new Error("expected one result for the warlock");

    expect(pact.pactSlotLevel).toBe(5);
    const [wizardResult] = SpellcastingEngine.calculate([wizard], scores, 3, []);
    if (!wizardResult) throw new Error("expected one result for the wizard");
    expect(wizardResult.pactSlotLevel).toBeUndefined();
  });

  it("returns nothing for a character that casts nothing", () => {
    expect(SpellcastingEngine.calculate([], scores, 3, [])).toEqual([]);
  });

  // The pin against the pack's authored pact_slot_level track lives in
  // slotTables.test.ts, beside the other pack-driven cases: it needs to read
  // the actual shipped resource, not a second hand-transcribed copy of it.
});
