import { describe, expect, it } from "vitest";
import { DerivedStatEngine, type LevelProfile } from "../derivedStats.js";
import type { FixedProficiencyGrant, RuntimeModifier } from "@project/shared";

// NOTE: DerivedStatEngine.calculateAC already has thorough coverage in
// armorClass.test.ts - this file intentionally covers calculateMaxHp and
// calculateInitiative only, to avoid duplicating that suite.

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "MAX_HP",
  type: "add",
  value: 0,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Source",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

const makeLevels = (overrides: Partial<LevelProfile> = {}): LevelProfile => ({
  total: 1,
  classes: {},
  ...overrides,
});

const makeProf = (
  overrides: Partial<FixedProficiencyGrant>,
): FixedProficiencyGrant => ({
  category: "skills",
  proficiencyId: "initiative",
  level: "proficient",
  requiredStates: [],
  ...overrides,
});

// #region calculateMaxHp

describe("DerivedStatEngine.calculateMaxHp", () => {
  describe("base HP (rolled HP + CON contribution)", () => {
    it("adds base HP rolled and CON modifier times total level", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        2,
        makeLevels({ total: 1 }),
        [],
      );

      expect(result.total).toBe(12);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 10 },
        { name: "CON (+2) x Level (1)", value: 2 },
      ]);
    });

    it("scales the CON contribution across multiple total levels", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        30,
        3,
        makeLevels({ total: 5, classes: { fighter: 5 } }),
        [],
      );

      expect(result.total).toBe(45);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 30 },
        { name: "CON (+3) x Level (5)", value: 15 },
      ]);
    });

    it("floors a negative CON modifier's contribution to a minimum of 1 per level", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        20,
        -2,
        makeLevels({ total: 3 }),
        [],
      );

      // 5e rule: 1 HP/level minimum regardless of a negative CON modifier
      expect(result.total).toBe(23);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 20 },
        { name: "CON (-2) x Level (3)", value: 3 },
      ]);
    });

    it("treats a zero CON modifier the same as the 1-per-level floor", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        20,
        0,
        makeLevels({ total: 4 }),
        [],
      );

      expect(result.total).toBe(24);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 20 },
        { name: "CON (+0) x Level (4)", value: 4 },
      ]);
    });
  });

  describe("MAX_HP modifiers - filtering", () => {
    it("ignores modifiers that do not target MAX_HP", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({ target: "ARMOR_CLASS", value: 5, sourceName: "Shield" }),
      ]);

      expect(result.total).toBe(11);
      expect(result.breakdown).toHaveLength(2);
    });

    it("ignores inactive MAX_HP modifiers", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({ value: 5, sourceName: "Tough Feat", isActive: false }),
      ]);

      expect(result.total).toBe(11);
      expect(result.breakdown).toHaveLength(2);
    });

    it("ignores modifiers whose forbiddenStates are currently active", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels(),
        [
          makeMod({
            value: 5,
            sourceName: "Bear Totem",
            forbiddenStates: ["wildshaped"],
          }),
        ],
        ["wildshaped"],
      );

      expect(result.total).toBe(11);
    });

    it("applies modifiers whose forbiddenStates are not active", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels(),
        [
          makeMod({
            value: 5,
            sourceName: "Bear Totem",
            forbiddenStates: ["wildshaped"],
          }),
        ],
        [],
      );

      expect(result.total).toBe(16);
    });

    it("excludes modifiers whose requiredStates are not satisfied", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels(),
        [
          makeMod({
            value: 5,
            sourceName: "Rage",
            requiredStates: ["raging"],
          }),
        ],
        [],
      );

      expect(result.total).toBe(11);
    });

    it("includes modifiers whose requiredStates are satisfied", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels(),
        [
          makeMod({
            value: 5,
            sourceName: "Rage",
            requiredStates: ["raging"],
          }),
        ],
        ["raging"],
      );

      expect(result.total).toBe(16);
    });

    it("ignores MAX_HP modifiers whose type is not 'add' (e.g. set_base)", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({ type: "set_base", value: 50, sourceName: "Fake Override" }),
      ]);

      expect(result.total).toBe(11);
      expect(result.breakdown).toHaveLength(2);
    });
  });

  describe("MAX_HP modifiers - values and scaling", () => {
    it("adds a flat 'add' modifier with no scaling and records it in the breakdown", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({ value: 3, sourceName: "Tough Feat" }),
      ]);

      expect(result.total).toBe(14);
      expect(result.breakdown).toContainEqual({
        name: "Tough Feat",
        value: "+3",
      });
    });

    it("renders a negative flat modifier with its minus sign", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({ value: -4, sourceName: "Withering Curse" }),
      ]);

      expect(result.total).toBe(7);
      expect(result.breakdown).toContainEqual({
        name: "Withering Curse",
        value: "-4",
      });
    });

    it("scales an add modifier by total_level", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels({ total: 5 }),
        [
          makeMod({
            value: 1,
            scalingFactor: "total_level",
            sourceName: "Draconic Resilience",
          }),
        ],
      );

      // base(10) + CON floor(1)*5 + Draconic Resilience(1*5)
      expect(result.total).toBe(20);
      expect(result.breakdown).toContainEqual({
        name: "Draconic Resilience",
        value: "+5",
      });
    });

    it("scales an add modifier by class_level using the matching class", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels({ total: 6, classes: { barbarian: 4, rogue: 2 } }),
        [
          makeMod({
            value: 2,
            scalingFactor: "class_level",
            scalingClassId: "barbarian",
            sourceName: "Barbarian Bonus",
          }),
        ],
      );

      // base(10) + CON floor(1)*6 + Barbarian Bonus(2*4)
      expect(result.total).toBe(24);
      expect(result.breakdown).toContainEqual({
        name: "Barbarian Bonus",
        value: "+8",
      });
    });

    it("treats an unmatched class_level scalingClassId as zero contribution and omits it from the breakdown", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        0,
        makeLevels({ total: 6, classes: { barbarian: 6 } }),
        [
          makeMod({
            value: 2,
            scalingFactor: "class_level",
            scalingClassId: "wizard", // character has no wizard levels
            sourceName: "Wizard Bonus",
          }),
        ],
      );

      // base(10) + CON floor(1)*6; the unmatched class contributes nothing
      expect(result.total).toBe(16);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 10 },
        { name: "CON (+0) x Level (6)", value: 6 },
      ]);
    });

    it("treats class_level scaling without a scalingClassId as an unscaled flat add (current implementation)", () => {
      const result = DerivedStatEngine.calculateMaxHp(10, 0, makeLevels(), [
        makeMod({
          value: 3,
          scalingFactor: "class_level",
          // scalingClassId intentionally omitted
          sourceName: "Ambiguous Bonus",
        }),
      ]);

      expect(result.total).toBe(14);
      expect(result.breakdown).toContainEqual({
        name: "Ambiguous Bonus",
        value: "+3",
      });
    });

    it("combines multiple modifiers with different scaling factors", () => {
      const result = DerivedStatEngine.calculateMaxHp(
        10,
        1,
        makeLevels({ total: 4, classes: { barbarian: 4 } }),
        [
          makeMod({ value: 2, sourceName: "Tough Feat" }),
          makeMod({
            value: 1,
            scalingFactor: "total_level",
            sourceName: "Per-Level Bonus",
          }),
          makeMod({
            value: 1,
            scalingFactor: "class_level",
            scalingClassId: "barbarian",
            sourceName: "Barbarian Bonus",
          }),
        ],
      );

      // base(10) + CON(1*4=4) + Tough(2) + PerLevel(1*4=4) + Barbarian(1*4=4)
      expect(result.total).toBe(24);
      expect(result.breakdown).toEqual([
        { name: "Base HP Rolled", value: 10 },
        { name: "CON (+1) x Level (4)", value: 4 },
        { name: "Tough Feat", value: "+2" },
        { name: "Per-Level Bonus", value: "+4" },
        { name: "Barbarian Bonus", value: "+4" },
      ]);
    });
  });
});

// #endregion

// #region calculateInitiative

describe("DerivedStatEngine.calculateInitiative", () => {
  describe("base dexterity", () => {
    it("uses the positive dexterity modifier as the base total", () => {
      const result = DerivedStatEngine.calculateInitiative(3, 2, [], []);

      expect(result.total).toBe(3);
      expect(result.breakdown[0]).toEqual({
        name: "Dexterity Modifier",
        value: "+3",
      });
    });

    it("renders a negative dexterity modifier with its minus sign", () => {
      const result = DerivedStatEngine.calculateInitiative(-2, 2, [], []);

      expect(result.total).toBe(-2);
      expect(result.breakdown[0]).toEqual({
        name: "Dexterity Modifier",
        value: "-2",
      });
    });

    it("renders a zero dexterity modifier with an explicit plus sign", () => {
      const result = DerivedStatEngine.calculateInitiative(0, 2, [], []);

      expect(result.total).toBe(0);
      expect(result.breakdown[0]).toEqual({
        name: "Dexterity Modifier",
        value: "+0",
      });
    });
  });

  describe("initiative proficiency multiplier", () => {
    it("applies a proficient (x1) multiplier to the proficiency bonus", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ level: "proficient" })],
        [],
      );

      expect(result.total).toBe(4);
      expect(result.breakdown).toContainEqual({
        name: "Proficiency (x1)",
        value: "+3",
      });
    });

    it("applies an expertise (x2) multiplier to the proficiency bonus", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ level: "expertise" })],
        [],
      );

      expect(result.total).toBe(7);
      expect(result.breakdown).toContainEqual({
        name: "Proficiency (x2)",
        value: "+6",
      });
    });

    it("applies a half (x0.5) multiplier and floors the result", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ level: "half" })],
        [],
      );

      // floor(3 * 0.5) = 1
      expect(result.total).toBe(2);
      expect(result.breakdown).toContainEqual({
        name: "Proficiency (x0.5)",
        value: "+1",
      });
    });

    it("still records a half-proficiency breakdown line when the floored contribution is zero", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        1,
        [makeProf({ level: "half" })],
        [],
      );

      // floor(1 * 0.5) = 0, but the multiplier was still > 0
      expect(result.total).toBe(1);
      expect(result.breakdown).toContainEqual({
        name: "Proficiency (x0.5)",
        value: "+0",
      });
    });

    it("ignores a skills grant whose proficiencyId is not 'initiative'", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ proficiencyId: "perception" })],
        [],
      );

      expect(result.total).toBe(1);
      expect(
        result.breakdown.some((b) => b.name.startsWith("Proficiency")),
      ).toBe(false);
    });

    it("ignores an 'initiative' grant whose category is not 'skills'", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ category: "ability_check" })],
        [],
      );

      expect(result.total).toBe(1);
      expect(
        result.breakdown.some((b) => b.name.startsWith("Proficiency")),
      ).toBe(false);
    });

    it("excludes a grant whose requiredStates are not satisfied", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ level: "expertise", requiredStates: ["alert_feat"] })],
        [],
      );

      expect(result.total).toBe(1);
    });

    it("includes a grant whose requiredStates are satisfied", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [makeProf({ level: "expertise", requiredStates: ["alert_feat"] })],
        [],
        ["alert_feat"],
      );

      expect(result.total).toBe(7);
    });

    it("uses the highest multiplier among multiple qualifying grants", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        3,
        [
          makeProf({ level: "proficient" }),
          makeProf({ level: "expertise" }),
          makeProf({ level: "half" }),
        ],
        [],
      );

      expect(result.total).toBe(7);
      expect(result.breakdown).toContainEqual({
        name: "Proficiency (x2)",
        value: "+6",
      });
    });
  });

  describe("INITIATIVE flat modifiers", () => {
    it("adds an active INITIATIVE modifier to the total", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [makeMod({ target: "INITIATIVE", value: 5, sourceName: "Alert" })],
      );

      expect(result.total).toBe(6);
      expect(result.breakdown).toContainEqual({
        name: "Alert",
        value: "+5",
      });
    });

    it("ignores modifiers that do not target INITIATIVE", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [makeMod({ target: "ARMOR_CLASS", value: 5, sourceName: "Shield" })],
      );

      expect(result.total).toBe(1);
    });

    it("ignores inactive INITIATIVE modifiers", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            value: 5,
            sourceName: "Alert",
            isActive: false,
          }),
        ],
      );

      expect(result.total).toBe(1);
    });

    it("ignores modifiers whose forbiddenStates are active", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            value: 5,
            sourceName: "Alert",
            forbiddenStates: ["surprised"],
          }),
        ],
        ["surprised"],
      );

      expect(result.total).toBe(1);
    });

    it("excludes modifiers whose requiredStates are not satisfied and includes them once satisfied", () => {
      const excluded = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            value: 5,
            sourceName: "Battle Fury",
            requiredStates: ["raging"],
          }),
        ],
        [],
      );
      const included = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            value: 5,
            sourceName: "Battle Fury",
            requiredStates: ["raging"],
          }),
        ],
        ["raging"],
      );

      expect(excluded.total).toBe(1);
      expect(included.total).toBe(6);
    });

    it("keeps only the highest-value modifier per source name and marks the rest as ignored duplicates", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({ target: "INITIATIVE", value: 2, sourceName: "Alert" }),
          makeMod({ target: "INITIATIVE", value: 5, sourceName: "Alert" }),
          makeMod({ target: "INITIATIVE", value: 3, sourceName: "Alert" }),
        ],
      );

      expect(result.total).toBe(6); // 1 (dex) + 5 (best "Alert"), not 1+2+5+3
      expect(result.breakdown).toEqual([
        { name: "Dexterity Modifier", value: "+1" },
        { name: "Alert", value: "+5" },
        { name: "Alert", value: "Ignored (Does not stack)", isIgnored: true },
        { name: "Alert", value: "Ignored (Does not stack)", isIgnored: true },
      ]);
    });

    it("sums add modifiers from distinct source names independently", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({ target: "INITIATIVE", value: 5, sourceName: "Alert" }),
          makeMod({
            target: "INITIATIVE",
            value: 2,
            sourceName: "Bracers of Reflex",
          }),
        ],
      );

      expect(result.total).toBe(8);
    });
  });

  describe("advantage / disadvantage flags", () => {
    it("reports Advantage granted by its source when only advantage modifiers are present", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            type: "advantage",
            sourceName: "Jack of All Trades Insight",
          }),
        ],
      );

      expect(result.breakdown).toContainEqual({
        name: "Advantage",
        value: "Granted by Jack of All Trades Insight",
      });
      expect(result.total).toBe(1); // advantage does not change the flat total
    });

    it("reports Disadvantage imposed by its source when only disadvantage modifiers are present", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            type: "disadvantage",
            sourceName: "Heavily Encumbered",
          }),
        ],
      );

      expect(result.breakdown).toContainEqual({
        name: "Disadvantage",
        value: "Imposed by Heavily Encumbered",
      });
    });

    it("reports a cancelled Straight Roll when both advantage and disadvantage are present", () => {
      const result = DerivedStatEngine.calculateInitiative(
        1,
        0,
        [],
        [
          makeMod({
            target: "INITIATIVE",
            type: "advantage",
            sourceName: "Alert",
          }),
          makeMod({
            target: "INITIATIVE",
            type: "disadvantage",
            sourceName: "Heavily Encumbered",
          }),
        ],
      );

      expect(result.breakdown).toContainEqual({
        name: "Straight Roll",
        value: "Advantage/Disadvantage cancel out",
      });
    });

    it("omits any advantage/disadvantage line when neither is present", () => {
      const result = DerivedStatEngine.calculateInitiative(1, 0, [], []);

      const flagNames = result.breakdown.map((b) => b.name);
      expect(flagNames).not.toContain("Advantage");
      expect(flagNames).not.toContain("Disadvantage");
      expect(flagNames).not.toContain("Straight Roll");
    });
  });

  describe("defaults", () => {
    it("defaults activeStates to an empty array when omitted", () => {
      const result = DerivedStatEngine.calculateInitiative(
        2,
        0,
        [],
        [],
      );

      expect(result.total).toBe(2);
    });
  });
});

// #endregion

// #region calculateAttacksPerAction

describe("DerivedStatEngine.calculateAttacksPerAction", () => {
  const extraAttack = (
    classId: string,
    thresholds: Array<{ minimumLevel: number; value: number }>,
    overrides: Partial<RuntimeModifier> = {},
  ): RuntimeModifier =>
    makeMod({
      target: "ATTACKS_PER_ACTION",
      type: "set_base",
      value: thresholds[0]?.value ?? 2,
      scalingFactor: "class_level_thresholds",
      scalingClassId: classId,
      scalingThresholds: thresholds,
      sourceName: "Extra Attack",
      sourceOrigin: "trait:trait_extra_attack",
      ...overrides,
    });

  it("grants one attack when nothing modifies the Attack action", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [],
      makeLevels(),
    );

    expect(result.total).toBe(1);
  });

  it("names the single attack in the breakdown so the panel can explain it", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [],
      makeLevels(),
    );

    expect(result.breakdown).toEqual([{ name: "Attack action", value: 1 }]);
  });

  it("raises the count to two for a fifth-level barbarian", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }])],
      makeLevels({ total: 5, classes: { class_barbarian: 5 } }),
    );

    expect(result.total).toBe(2);
    expect(result.breakdown).toEqual([{ name: "Extra Attack", value: 2 }]);
  });

  it("leaves the count at one below the threshold level", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }])],
      makeLevels({ total: 4, classes: { class_barbarian: 4 } }),
    );

    expect(result.total).toBe(1);
  });

  it("follows a multi-step progression to its highest met threshold", () => {
    const fighter = extraAttack("class_fighter", [
      { minimumLevel: 5, value: 2 },
      { minimumLevel: 11, value: 3 },
      { minimumLevel: 20, value: 4 },
    ]);

    const eleven = DerivedStatEngine.calculateAttacksPerAction(
      [fighter],
      makeLevels({ total: 11, classes: { class_fighter: 11 } }),
    );
    const twenty = DerivedStatEngine.calculateAttacksPerAction(
      [fighter],
      makeLevels({ total: 20, classes: { class_fighter: 20 } }),
    );

    expect(eleven.total).toBe(3);
    expect(twenty.total).toBe(4);
  });

  it("takes the highest candidate rather than summing, because Extra Attack does not stack", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }], {
          id: "mod_barb",
        }),
        extraAttack(
          "class_fighter",
          [
            { minimumLevel: 5, value: 2 },
            { minimumLevel: 11, value: 3 },
          ],
          { id: "mod_fighter" },
        ),
      ],
      makeLevels({
        total: 16,
        classes: { class_barbarian: 5, class_fighter: 11 },
      }),
    );

    expect(result.total).toBe(3);
  });

  it("marks the losing candidate as ignored rather than hiding it", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }], {
          id: "mod_barb",
          sourceName: "Extra Attack (Barbarian)",
        }),
        extraAttack(
          "class_fighter",
          [
            { minimumLevel: 5, value: 2 },
            { minimumLevel: 11, value: 3 },
          ],
          { id: "mod_fighter", sourceName: "Extra Attack (Fighter)" },
        ),
      ],
      makeLevels({
        total: 16,
        classes: { class_barbarian: 5, class_fighter: 11 },
      }),
    );

    expect(result.breakdown).toEqual([
      { name: "Extra Attack (Fighter)", value: 3 },
      {
        name: "Extra Attack (Barbarian)",
        value: "Ignored (Does not stack)",
        isIgnored: true,
      },
    ]);
  });

  it("never lets a candidate lower the count below one", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        makeMod({
          target: "ATTACKS_PER_ACTION",
          type: "set_base",
          value: 0,
          sourceName: "Broken Rule",
        }),
      ],
      makeLevels(),
    );

    expect(result.total).toBe(1);
  });

  it("skips a candidate whose forbidden state is active", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }], {
          forbiddenStates: ["incapacitated"],
        }),
      ],
      makeLevels({ total: 5, classes: { class_barbarian: 5 } }),
      ["incapacitated"],
    );

    expect(result.total).toBe(1);
  });

  it("skips a candidate whose required state is missing", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }], {
          requiredStates: ["status_raging"],
        }),
      ],
      makeLevels({ total: 5, classes: { class_barbarian: 5 } }),
    );

    expect(result.total).toBe(1);
  });

  it("skips an inactive candidate", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        extraAttack("class_barbarian", [{ minimumLevel: 5, value: 2 }], {
          isActive: false,
        }),
      ],
      makeLevels({ total: 5, classes: { class_barbarian: 5 } }),
    );

    expect(result.total).toBe(1);
  });

  it("ignores modifiers aimed at other targets", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [makeMod({ target: "MAX_HP", type: "set_base", value: 9 })],
      makeLevels(),
    );

    expect(result.total).toBe(1);
  });

  it("accepts an unscaled candidate at its face value", () => {
    const result = DerivedStatEngine.calculateAttacksPerAction(
      [
        makeMod({
          target: "ATTACKS_PER_ACTION",
          type: "set_base",
          value: 2,
          sourceName: "Extra Attack",
        }),
      ],
      makeLevels(),
    );

    expect(result.total).toBe(2);
  });
});

// #endregion
