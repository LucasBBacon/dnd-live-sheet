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

  it("agrees with the pack's authored pact_slot_level track at every warlock level", () => {
    // The pack authors class_level_thresholds on warlock level: 1@1, 2@3,
    // 3@5, 4@7, 5@9, capping at 5 (packages/database/data/packs/core_2014_pack/classes/warlock.json).
    // pactSlotLevel is a second, independent expression of the same rule, so
    // pin it against that track for every level a warlock can be.
    const packTrack = (warlockLevel: number): number => {
      const thresholds = [
        { minimumLevel: 1, value: 1 },
        { minimumLevel: 3, value: 2 },
        { minimumLevel: 5, value: 3 },
        { minimumLevel: 7, value: 4 },
        { minimumLevel: 9, value: 5 },
      ];
      let value = 0;
      for (const threshold of thresholds) {
        if (warlockLevel >= threshold.minimumLevel) value = threshold.value;
      }
      return value;
    };

    for (let level = 1; level <= 20; level++) {
      const [pact] = SpellcastingEngine.calculate(
        [{ classId: "class_warlock", level, progression: "pact", ability: "CHA" }],
        scores,
        3,
        [],
      );
      if (!pact) throw new Error(`expected one result for warlock level ${level}`);
      expect(pact.pactSlotLevel).toBe(packTrack(level));
    }
  });
});
