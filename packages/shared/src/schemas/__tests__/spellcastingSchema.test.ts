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
  it("accepts an ability and a progression", () => {
    expect(
      SpellcastingSchema.parse({ ability: "INT", progression: "full" }),
    ).toEqual({ ability: "INT", progression: "full" });
  });

  it("rejects a non-casting ability", () => {
    expect(() =>
      SpellcastingSchema.parse({ ability: "STR", progression: "full" }),
    ).toThrow();
  });

  it("rejects an unknown progression", () => {
    expect(() =>
      SpellcastingSchema.parse({ ability: "INT", progression: "quarter" }),
    ).toThrow();
  });

  it("rejects an unknown key, so a typo cannot be authored silently", () => {
    expect(() =>
      SpellcastingSchema.parse({
        ability: "INT",
        progression: "full",
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
      spellcasting: { ability: "INT", progression: "full" },
    });

    expect(parsed.spellcasting).toEqual({ ability: "INT", progression: "full" });
  });
});
