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

describe("SaveEngine.calculateSaves - roll state", () => {
  it("reports a normal roll when nothing grants advantage", () => {
    const saves = SaveEngine.calculateSaves(makeScores(), 0, [], []);

    expect(saves.DEX!.rollState).toBe("normal");
  });

  it("reports advantage granted by its source", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ target: "DEX_SAVE", type: "advantage", sourceName: "Fey Ancestry" })],
    );

    expect(saves.DEX!.rollState).toBe("advantage");
  });

  it("leaves the other five saves normal when only one is targeted", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ target: "DEX_SAVE", type: "advantage", sourceName: "Fey Ancestry" })],
    );

    expect(saves.STR!.rollState).toBe("normal");
    expect(saves.CHA!.rollState).toBe("normal");
  });

  it("applies an ALL_SAVES advantage to every save", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ target: "ALL_SAVES", type: "advantage", sourceName: "Bless" })],
    );

    for (const ability of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
      expect(saves[ability]!.rollState, ability).toBe("advantage");
    }
  });

  it("reports disadvantage imposed by its source", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [makeMod({ target: "DEX_SAVE", type: "disadvantage", sourceName: "Restrained" })],
    );

    expect(saves.DEX!.rollState).toBe("disadvantage");
  });

  it("cancels advantage against disadvantage back to a straight roll", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [
        makeMod({ id: "adv", target: "DEX_SAVE", type: "advantage", sourceName: "Danger Sense" }),
        makeMod({ id: "dis", target: "DEX_SAVE", type: "disadvantage", sourceName: "Restrained" }),
      ],
    );

    expect(saves.DEX!.rollState).toBe("normal");
  });

  it("ignores an advantage modifier whose forbidden state is active", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [
        makeMod({
          target: "DEX_SAVE",
          type: "advantage",
          sourceName: "Danger Sense",
          forbiddenStates: ["blinded"],
        }),
      ],
      ["blinded"],
    );

    expect(saves.DEX!.rollState).toBe("normal");
  });

  it("leaves the numeric modifier untouched by a roll state modifier", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores({ DEX: 16 }),
      0,
      [],
      [makeMod({ target: "DEX_SAVE", type: "advantage", value: 5, sourceName: "Danger Sense" })],
    );

    expect(saves.DEX!.totalModifier).toBe(3);
  });
});

describe("SaveEngine.calculateSaves - conditional notes", () => {
  const dangerSense = (overrides: Partial<RuntimeModifier> = {}) =>
    makeMod({
      target: "DEX_SAVE",
      type: "advantage",
      sourceName: "Danger Sense",
      appliesWhen: "against effects that you can see",
      forbiddenStates: ["blinded", "deafened", "incapacitated"],
      ...overrides,
    });

  it("reports a rider the engine cannot evaluate instead of applying it", () => {
    const saves = SaveEngine.calculateSaves(makeScores(), 0, [], [dangerSense()]);

    expect(saves.DEX!.rollState).toBe("normal");
    expect(saves.DEX!.conditionalNotes).toEqual([
      {
        source: "Danger Sense",
        appliesWhen: "against effects that you can see",
        type: "advantage",
      },
    ]);
  });

  it("carries no notes on a save nothing qualifies", () => {
    const saves = SaveEngine.calculateSaves(makeScores(), 0, [], [dangerSense()]);

    expect(saves.STR!.conditionalNotes).toEqual([]);
  });

  it.each(["blinded", "deafened", "incapacitated"])(
    "drops the note entirely while %s",
    (condition) => {
      const saves = SaveEngine.calculateSaves(
        makeScores(),
        0,
        [],
        [dangerSense()],
        [condition],
      );

      expect(saves.DEX!.conditionalNotes).toEqual([]);
    },
  );

  it("keeps a conditional note out of the cancel-out calculation", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [
        dangerSense(),
        makeMod({
          id: "dis",
          target: "DEX_SAVE",
          type: "disadvantage",
          sourceName: "Restrained",
        }),
      ],
    );

    // the unconditional disadvantage stands alone: a caveated advantage must
    // not cancel it, or a restrained barbarian would silently roll straight
    expect(saves.DEX!.rollState).toBe("disadvantage");
    expect(saves.DEX!.conditionalNotes).toHaveLength(1);
  });

  it("does not fold a conditional numeric bonus into the total", () => {
    const saves = SaveEngine.calculateSaves(
      makeScores(),
      0,
      [],
      [
        makeMod({
          target: "DEX_SAVE",
          type: "add",
          value: 2,
          sourceName: "Cloak of Warding",
          appliesWhen: "against spells",
        }),
      ],
    );

    expect(saves.DEX!.totalModifier).toBe(0);
    expect(saves.DEX!.conditionalNotes).toEqual([
      {
        source: "Cloak of Warding",
        appliesWhen: "against spells",
        type: "add",
      },
    ]);
  });
});
