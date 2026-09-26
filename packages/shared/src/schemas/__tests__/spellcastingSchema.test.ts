import { describe, expect, it } from "vitest";
import { ClassDefinitionSchema, SpellcastingSchema } from "../content/character.js";
import { ChargesResourceSchema } from "../content/resources.js";

const minimalClass = {
  id: "class_wizard",
  name: "Wizard",
  hitDie: 6,
  subclassUnlockLevel: 2,
  progression: [],
};

describe("SpellcastingSchema", () => {
  it("accepts an ability, a progression, a start level, preparation and foci", () => {
    const block = {
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
    };

    expect(SpellcastingSchema.parse(block)).toEqual(block);
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

  // required, not defaulted, for the same reason startsAtLevel is: a caster
  // without an answer fails to validate instead of quietly reading as one
  it("rejects a block that does not say how it prepares, or what foci it uses", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        focusCategories: [],
      }),
    ).toThrow();
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        preparation: "known",
      }),
    ).toThrow();
  });

  it("rejects a focus category that is not a spellcasting focus", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
        startsAtLevel: 1,
        preparation: "prepared",
        focusCategories: ["category_weapon_simple"],
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
        focusCategories: [],
        slotTable: "full",
      }),
    ).toThrow();
  });
});

describe("a class may declare how it casts", () => {
  it("accepts a class with no spellcasting block", () => {
    expect(ClassDefinitionSchema.parse(minimalClass).spellcasting).toBeUndefined();
  });

  it("carries the block through when present", () => {
    const block = {
      ability: "INT",
      progression: "full",
      startsAtLevel: 1,
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
    };

    expect(
      ClassDefinitionSchema.parse({ ...minimalClass, spellcasting: block })
        .spellcasting,
    ).toEqual(block);
  });
});

describe("a charges pool may declare itself a spell slot", () => {
  const pool = {
    id: "spell_slots_3",
    name: "3rd-Level Spell Slots",
    resetCondition: "long_rest",
    maxRule: { kind: "fixed", value: 2 },
  };

  it("carries a slot level, or pact", () => {
    expect(
      ChargesResourceSchema.parse({
        ...pool,
        spellSlot: { kind: "level", level: 3 },
      }).spellSlot,
    ).toEqual({ kind: "level", level: 3 });
    expect(
      ChargesResourceSchema.parse({ ...pool, spellSlot: { kind: "pact" } })
        .spellSlot,
    ).toEqual({ kind: "pact" });
  });

  it("rejects a slot level above 9", () => {
    expect(() =>
      ChargesResourceSchema.parse({
        ...pool,
        spellSlot: { kind: "level", level: 10 },
      }),
    ).toThrow();
  });
});
