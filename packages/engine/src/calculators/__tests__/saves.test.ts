import { describe, expect, it } from "vitest";
import { SaveEngine } from "../saves.js";
import type { Ability } from "../../types/core.js";
import type { FixedProficiencyGrant, RuntimeModifier } from "@project/shared";

const makeScores = (
  overrides: Partial<Record<Ability, number>> = {},
): Record<Ability, number> => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...overrides,
});

const makeProf = (
  ability: string,
  level: "proficient" | "expertise" = "proficient",
): FixedProficiencyGrant => ({
  category: "saving_throws",
  proficiencyId: ability,
  level,
  requiredStates: [],
});

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "ALL_SAVES",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

describe("SaveEngine.calculateSaves - baseline", () => {
  it("returns all six abilities as keys", () => {
    const saves = SaveEngine.calculateSaves(makeScores(), 2, [], [], []);

    expect(Object.keys(saves).sort()).toEqual(
      ["CHA", "CON", "DEX", "INT", "STR", "WIS"],
    );
  });

  it("uses the governing ability modifier as the base", () => {
    const saves = SaveEngine.calculateSaves(makeScores({ STR: 16 }), 2, [], []);

    expect(saves.STR!.totalModifier).toBe(3);
    expect(saves.DEX!.totalModifier).toBe(0);
  });
});

describe("SaveEngine.calculateSaves - proficiency", () => {
  it("adds proficiency bonus when the ability is proficient", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      3,
      [makeProf("STR")],
      [],
    );

    expect(saves.STR!.totalModifier).toBe(3);
    expect(saves.STR!.isProficient).toBe(true);
    expect(saves.DEX!.isProficient).toBe(false);
  });

  it("adds doubled proficiency for expertise", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      2,
      [makeProf("WIS", "expertise")],
      [],
    );

    expect(saves.WIS!.totalModifier).toBe(4);
  });

  it("does not apply proficiency whose requiredStates are not active", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      3,
      [{ ...makeProf("CON"), requiredStates: ["raging"] }],
      [],
      [],
    );

    expect(saves.CON!.isProficient).toBe(false);
    expect(saves.CON!.totalModifier).toBe(0);
  });
});

describe("SaveEngine.calculateSaves - modifiers", () => {
  it("applies an ALL_SAVES flat bonus to every save", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ value: 2, sourceName: "Ring of Protection" })],
    );

    for (const ability of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
      expect(saves[ability]!.totalModifier, ability).toBe(2);
    }
  });

  it("applies an individual save modifier only to its target", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ target: "CON_SAVE", value: 3, sourceName: "Warcaster" })],
    );

    expect(saves.CON!.totalModifier).toBe(3);
    expect(saves.STR!.totalModifier).toBe(0);
  });

  it("ignores inactive modifiers", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ isActive: false, value: 5 })],
    );

    expect(saves.STR!.totalModifier).toBe(0);
  });

  it("ignores modifiers whose forbiddenStates are active", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ forbiddenStates: ["incapacitated"], value: 3 })],
      ["incapacitated"],
    );

    expect(saves.STR!.totalModifier).toBe(0);
  });

  it("resolves valueSource cha_modifier as the CHA ability modifier", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores({ CHA: 18 }),
      0,
      [],
      [
        makeMod({
          sourceName: "Aura of Protection",
          value: 0,
          valueSource: "cha_modifier",
        }),
      ],
    );

    const chaMod = Math.floor((18 - 10) / 2); // 4
    // STR/DEX/CON/INT/WIS base modifier is 0 (score 10), plus +4 from aura
    for (const ability of ["STR", "DEX", "CON", "INT", "WIS"]) {
      expect(saves[ability]!.totalModifier, ability).toBe(chaMod);
    }
    // CHA base modifier is +4, plus +4 from aura = +8
    expect(saves.CHA!.totalModifier).toBe(chaMod + chaMod);
  });

  it("skips a cha_modifier modifier whose value resolves to 0", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores({ CHA: 10 }),
      0,
      [],
      [makeMod({ sourceName: "Aura of Protection", value: 0, valueSource: "cha_modifier" })],
    );

    expect(saves.STR!.breakdown).not.toContain("Aura of Protection");
  });
});
