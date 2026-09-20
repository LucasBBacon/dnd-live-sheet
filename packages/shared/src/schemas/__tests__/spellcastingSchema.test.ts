import { describe, expect, it } from "vitest";
import { ClassDefinitionSchema, SpellcastingSchema } from "../content/character.js";

const minimalClass = {
  id: "class_wizard",
  name: "Wizard",
  hitDie: 6,
  subclassUnlockLevel: 2,
  progression: [],
};

describe("SpellcastingSchema", () => {
  it("accepts an ability, a progression and a startsAtLevel", () => {
    expect(
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
      }),
    ).toEqual({ ability: "INT", progression: "full", startsAtLevel: 1 });
  });

  it("rejects a non-casting ability", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "STR",
        progression: "full",
        startsAtLevel: 1,
      }),
    ).toThrow();
  });

  it("rejects an unknown progression", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "quarter",
        startsAtLevel: 1,
      }),
    ).toThrow();
  });

  // required, not defaulted: a class or subclass without an explicit answer
  // fails to validate instead of quietly reading as "casts from level 1" -
  // the exact silent-zero failure mode this branch exists to forbid, just
  // for a start level rather than a caster level.
  it("rejects a missing startsAtLevel rather than defaulting it", () => {
    expect(() =>
      SpellcastingSchema.parse({ ability: "INT", progression: "full" }),
    ).toThrow();
  });

  it("rejects a startsAtLevel outside 1-20", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "half",
        startsAtLevel: 0,
      }),
    ).toThrow();
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "half",
        startsAtLevel: 21,
      }),
    ).toThrow();
  });

  it("rejects an unknown key, so a typo cannot be authored silently", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        preparation: "prepared",
      }),
    ).toThrow();
  });
});

describe("a class may declare how it casts", () => {
  it("accepts a class with no spellcasting block", () => {
    expect(ClassDefinitionSchema.parse(minimalClass).spellcasting).toBeUndefined();
  });

  it("carries the block through when present", () => {
    const parsed = ClassDefinitionSchema.parse({
      ...minimalClass,
      spellcasting: { ability: "INT", progression: "full", startsAtLevel: 1 },
    });

    expect(parsed.spellcasting).toEqual({
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
    });
  });
});
