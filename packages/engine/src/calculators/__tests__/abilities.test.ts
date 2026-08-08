import { describe, expect, it } from "vitest";
import { AbilityEngine } from "../abilities.js";
import type { RuntimeModifier } from "@project/shared";

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "STR",
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

describe("AbilityEngine.calculateScore", () => {
  it("returns the base score untouched when there are no modifiers", () => {
    const result = AbilityEngine.calculateScore(14, "STR", []);

    expect(result.score).toBe(14);
    expect(result.modifier).toBe(2);
    expect(result.breakdown).toBe("Base (14)");
  });

  it("defaults activeStates to an empty array when omitted", () => {
    const result = AbilityEngine.calculateScore(10, "DEX", []);

    expect(result.score).toBe(10);
    expect(result.modifier).toBe(0);
  });

  it("applies active add modifiers targeting the ability and records them in the breakdown", () => {
    const result = AbilityEngine.calculateScore(14, "STR", [
      makeMod({ sourceName: "Belt of Giant Strength", value: 4 }),
      makeMod({ sourceName: "Ability Score Improvement", value: 2 }),
    ]);

    expect(result.score).toBe(20);
    expect(result.modifier).toBe(5);
    expect(result.breakdown).toBe(
      "Base (14) | Belt of Giant Strength (+4) | Ability Score Improvement (+2)",
    );
  });

  it("renders negative add modifiers with a minus sign and lowers the score", () => {
    const result = AbilityEngine.calculateScore(10, "STR", [
      makeMod({ sourceName: "Cursed Ring", value: -2 }),
    ]);

    expect(result.score).toBe(8);
    expect(result.modifier).toBe(-1);
    expect(result.breakdown).toBe("Base (10) | Cursed Ring (-2)");
  });

  it("ignores modifiers targeting a different ability", () => {
    const result = AbilityEngine.calculateScore(10, "STR", [
      makeMod({ target: "DEX", sourceName: "Gloves of Dexterity", value: 4 }),
    ]);

    expect(result.score).toBe(10);
    expect(result.breakdown).toBe("Base (10)");
  });

  it("ignores inactive modifiers", () => {
    const result = AbilityEngine.calculateScore(10, "STR", [
      makeMod({ sourceName: "Removed Buff", value: 4, isActive: false }),
    ]);

    expect(result.score).toBe(10);
    expect(result.breakdown).toBe("Base (10)");
  });

  it("excludes modifiers whose requiredStates are not all present in activeStates", () => {
    const result = AbilityEngine.calculateScore(
      10,
      "STR",
      [
        makeMod({
          sourceName: "Rage",
          value: 2,
          requiredStates: ["raging"],
        }),
      ],
      [],
    );

    expect(result.score).toBe(10);
    expect(result.breakdown).toBe("Base (10)");
  });

  it("includes modifiers when all requiredStates are present in activeStates", () => {
    const result = AbilityEngine.calculateScore(
      10,
      "STR",
      [
        makeMod({
          sourceName: "Rage",
          value: 2,
          requiredStates: ["raging"],
        }),
      ],
      ["raging"],
    );

    expect(result.score).toBe(12);
    expect(result.breakdown).toBe("Base (10) | Rage (+2)");
  });

  it("caps the natural score at 20 and notes the cap in the breakdown", () => {
    const result = AbilityEngine.calculateScore(18, "STR", [
      makeMod({ sourceName: "Hill Giant Strength Potion", value: 6 }),
    ]);

    expect(result.score).toBe(20);
    expect(result.modifier).toBe(5);
    expect(result.breakdown).toBe(
      "Base (18) | Hill Giant Strength Potion (+6) | (Capped at 20)",
    );
  });

  it("raises the cap when an active state requests a higher limit", () => {
    const result = AbilityEngine.calculateScore(
      18,
      "STR",
      [makeMod({ sourceName: "Heightened Strength", value: 8 })],
      ["ability_cap_24"],
    );

    expect(result.score).toBe(24);
    expect(result.modifier).toBe(7);
    expect(result.breakdown).toBe(
      "Base (18) | Heightened Strength (+8) | (Capped at 24)",
    );
  });

  it("does not note a cap when the natural score is exactly at the cap", () => {
    const result = AbilityEngine.calculateScore(20, "STR", []);

    expect(result.score).toBe(20);
    expect(result.breakdown).toBe("Base (20)");
  });

  it("applies a set_base override that exceeds the natural score", () => {
    const result = AbilityEngine.calculateScore(10, "STR", [
      makeMod({
        type: "set_base",
        value: 19,
        sourceName: "Belt of Hill Giant Strength",
      }),
    ]);

    expect(result.score).toBe(19);
    expect(result.modifier).toBe(4);
    expect(result.breakdown).toBe(
      "Overridden by Belt of Hill Giant Strength (19) | Base (10) | [Natural Score Ignored]",
    );
  });

  it("ignores a set_base override that is lower than the natural score", () => {
    const result = AbilityEngine.calculateScore(18, "STR", [
      makeMod({
        type: "set_base",
        value: 15,
        sourceName: "Weak Belt",
      }),
    ]);

    expect(result.score).toBe(18);
    expect(result.breakdown).toBe("Base (18)");
  });

  it("ignores a set_base override equal to the natural score", () => {
    const result = AbilityEngine.calculateScore(15, "STR", [
      makeMod({
        type: "set_base",
        value: 15,
        sourceName: "Redundant Belt",
      }),
    ]);

    expect(result.score).toBe(15);
    expect(result.breakdown).toBe("Base (15)");
  });

  it("picks the highest of multiple competing set_base overrides", () => {
    const result = AbilityEngine.calculateScore(8, "STR", [
      makeMod({
        type: "set_base",
        value: 19,
        sourceName: "Belt of Hill Giant Strength",
      }),
      makeMod({
        type: "set_base",
        value: 23,
        sourceName: "Belt of Storm Giant Strength",
      }),
      makeMod({
        type: "set_base",
        value: 21,
        sourceName: "Belt of Fire Giant Strength",
      }),
    ]);

    expect(result.score).toBe(23);
    expect(result.breakdown).toBe(
      "Overridden by Belt of Storm Giant Strength (23) | Base (8) | [Natural Score Ignored]",
    );
  });

  it("combines add modifiers and a winning override, still reporting the natural breakdown", () => {
    const result = AbilityEngine.calculateScore(14, "STR", [
      makeMod({ sourceName: "Ability Score Improvement", value: 2 }),
      makeMod({
        type: "set_base",
        value: 19,
        sourceName: "Belt of Hill Giant Strength",
      }),
    ]);

    expect(result.score).toBe(19);
    expect(result.breakdown).toBe(
      "Overridden by Belt of Hill Giant Strength (19) | Base (14) | Ability Score Improvement (+2) | [Natural Score Ignored]",
    );
  });
});

describe("AbilityEngine.getModifier", () => {
  it.each([
    [1, -5],
    [3, -4],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [18, 4],
    [20, 5],
    [30, 10],
  ])("maps score %i to modifier %i", (score, expected) => {
    expect(AbilityEngine.getModifier(score)).toBe(expected);
  });
});

describe("AbilityEngine.getProficiencyBonus", () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])("maps total level %i to proficiency bonus %i", (level, expected) => {
    expect(AbilityEngine.getProficiencyBonus(level)).toBe(expected);
  });
});
