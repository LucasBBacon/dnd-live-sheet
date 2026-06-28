import { describe, expect, it } from "vitest";
import {
  SenseEffectSchema,
  ProficiencyEffectSchema,
  StatModifierEffectSchema,
  SpellGrantEffectSchema,
  OtherEffectSchema,
  TraitEffectSchema,
} from "../effects.js";

describe("Sense Effect Schema", () => {
  const validSense = {
    type: "sense",
    target: "darkvision",
    value: 60,
  };

  it("accepts valid sense effect", () => {
    expect(SenseEffectSchema.parse(validSense)).toEqual(validSense);
  });

  it("accepts different sense targets", () => {
    const targets = ["darkvision", "blindsight", "truesight", "custom_sense"];
    targets.forEach((target) => {
      expect(SenseEffectSchema.parse({ ...validSense, target })).toBeDefined();
    });
  });

  it("accepts positive sense distance values", () => {
    expect(SenseEffectSchema.parse({ ...validSense, value: 120 })).toBeDefined();
    expect(SenseEffectSchema.parse({ ...validSense, value: 1 })).toBeDefined();
  });

  it("accepts zero sense distance", () => {
    expect(SenseEffectSchema.parse({ ...validSense, value: 0 })).toBeDefined();
  });

  it("accepts negative sense distance", () => {
    expect(SenseEffectSchema.parse({ ...validSense, value: -30 })).toBeDefined();
  });

  it("rejects non-integer distance", () => {
    expect(() => SenseEffectSchema.parse({ ...validSense, value: 60.5 })).toThrow();
  });

  it("accepts optional levelAvailable", () => {
    expect(
      SenseEffectSchema.parse({ ...validSense, levelAvailable: 3 })
    ).toBeDefined();
  });

  it("rejects levelAvailable below 1", () => {
    expect(() =>
      SenseEffectSchema.parse({ ...validSense, levelAvailable: 0 })
    ).toThrow();
  });

  it("rejects levelAvailable above 20", () => {
    expect(() =>
      SenseEffectSchema.parse({ ...validSense, levelAvailable: 21 })
    ).toThrow();
  });

  it("accepts levelAvailable boundaries (1-20)", () => {
    expect(
      SenseEffectSchema.parse({ ...validSense, levelAvailable: 1 })
    ).toBeDefined();
    expect(
      SenseEffectSchema.parse({ ...validSense, levelAvailable: 20 })
    ).toBeDefined();
  });
});

describe("Proficiency Effect Schema", () => {
  const validProficiency = {
    type: "proficiency",
    category: "armor",
    item: "light_armor",
  };

  it("accepts valid proficiency effect", () => {
    expect(ProficiencyEffectSchema.parse(validProficiency)).toEqual(
      validProficiency
    );
  });

  it("accepts all proficiency categories", () => {
    const categories = [
      "armor",
      "weapons",
      "tools",
      "saving_throws",
      "skills",
      "languages",
    ] as const;
    categories.forEach((category) => {
      expect(
        ProficiencyEffectSchema.parse({ ...validProficiency, category })
      ).toBeDefined();
    });
  });

  it("accepts various item identifiers", () => {
    const items = ["skill_stealth", "weapon_martial", "lang_draconic", "tool_thieves_tools"];
    items.forEach((item) => {
      expect(
        ProficiencyEffectSchema.parse({ ...validProficiency, item })
      ).toBeDefined();
    });
  });

  it("rejects invalid category", () => {
    expect(() =>
      ProficiencyEffectSchema.parse({
        ...validProficiency,
        category: "invalid_category",
      })
    ).toThrow();
  });

  it("accepts optional levelAvailable", () => {
    expect(
      ProficiencyEffectSchema.parse({ ...validProficiency, levelAvailable: 5 })
    ).toBeDefined();
  });
});

describe("Stat Modifier Effect Schema", () => {
  const validStatMod = {
    type: "stat_modifier",
    target: "str",
    value: 2,
  };

  it("accepts valid stat modifier effect", () => {
    expect(StatModifierEffectSchema.parse(validStatMod)).toEqual(
      validStatMod
    );
  });

  it("accepts all ability score targets", () => {
    const targets = ["str", "dex", "con", "int", "wis", "cha"] as const;
    targets.forEach((target) => {
      expect(
        StatModifierEffectSchema.parse({ ...validStatMod, target })
      ).toBeDefined();
    });
  });

  it("accepts positive modifier values", () => {
    expect(StatModifierEffectSchema.parse({ ...validStatMod, value: 5 })).toBeDefined();
  });

  it("accepts negative modifier values", () => {
    expect(StatModifierEffectSchema.parse({ ...validStatMod, value: -2 })).toBeDefined();
  });

  it("accepts zero modifier value", () => {
    expect(StatModifierEffectSchema.parse({ ...validStatMod, value: 0 })).toBeDefined();
  });

  it("rejects non-integer modifier value", () => {
    expect(() =>
      StatModifierEffectSchema.parse({ ...validStatMod, value: 2.5 })
    ).toThrow();
  });

  it("rejects invalid target", () => {
    expect(() =>
      StatModifierEffectSchema.parse({ ...validStatMod, target: "invalid" })
    ).toThrow();
  });
});

describe("Spell Grant Effect Schema", () => {
  const validSpellGrant = {
    type: "spell_grant",
    target: "spell_fireball",
  };

  it("accepts valid spell grant effect", () => {
    expect(SpellGrantEffectSchema.parse(validSpellGrant)).toEqual(
      validSpellGrant
    );
  });

  it("accepts various spell identifiers", () => {
    const spells = ["spell_fireball", "spell_shield", "spell_magic_missile"];
    spells.forEach((spell) => {
      expect(
        SpellGrantEffectSchema.parse({ ...validSpellGrant, target: spell })
      ).toBeDefined();
    });
  });

  it("accepts optional spellcasting ability", () => {
    expect(
      SpellGrantEffectSchema.parse({
        ...validSpellGrant,
        spellcastingAbility: "int",
      })
    ).toBeDefined();
  });

  it("accepts all spellcasting abilities", () => {
    const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;
    abilities.forEach((ability) => {
      expect(
        SpellGrantEffectSchema.parse({
          ...validSpellGrant,
          spellcastingAbility: ability,
        })
      ).toBeDefined();
    });
  });

  it("rejects invalid spellcasting ability", () => {
    expect(() =>
      SpellGrantEffectSchema.parse({
        ...validSpellGrant,
        spellcastingAbility: "invalid",
      })
    ).toThrow();
  });
});

describe("Other Effect Schema", () => {
  const validOther = {
    type: "other",
  };

  it("accepts valid other effect without value", () => {
    expect(OtherEffectSchema.parse(validOther)).toBeDefined();
  });

  it("accepts other effect with optional value", () => {
    expect(OtherEffectSchema.parse({ type: "other", value: "metadata" })).toBeDefined();
  });

  it("accepts various metadata values", () => {
    const values = ["flag1", "special_ability", "custom_trait"];
    values.forEach((value) => {
      expect(OtherEffectSchema.parse({ type: "other", value })).toBeDefined();
    });
  });

  it("accepts optional levelAvailable", () => {
    expect(OtherEffectSchema.parse({ type: "other", levelAvailable: 10 })).toBeDefined();
  });
});

describe("Trait Effect Schema (discriminated union)", () => {
  it("accepts sense effect through union", () => {
    expect(
      TraitEffectSchema.parse({
        type: "sense",
        target: "darkvision",
        value: 60,
      })
    ).toBeDefined();
  });

  it("accepts proficiency effect through union", () => {
    expect(
      TraitEffectSchema.parse({
        type: "proficiency",
        category: "weapons",
        item: "martial",
      })
    ).toBeDefined();
  });

  it("accepts stat_modifier effect through union", () => {
    expect(
      TraitEffectSchema.parse({
        type: "stat_modifier",
        target: "dex",
        value: 2,
      })
    ).toBeDefined();
  });

  it("accepts spell_grant effect through union", () => {
    expect(
      TraitEffectSchema.parse({
        type: "spell_grant",
        target: "spell_magic_missile",
      })
    ).toBeDefined();
  });

  it("accepts other effect through union", () => {
    expect(TraitEffectSchema.parse({ type: "other" })).toBeDefined();
  });

  it("discriminates based on type field", () => {
    expect(() =>
      TraitEffectSchema.parse({
        type: "unknown",
        value: 123,
      })
    ).toThrow();
  });

  it("rejects effect with correct type but invalid structure", () => {
    expect(() =>
      TraitEffectSchema.parse({
        type: "sense",
        target: "darkvision",
        value: "not-a-number",
      })
    ).toThrow();
  });

  it("rejects effect missing required fields for type", () => {
    expect(() =>
      TraitEffectSchema.parse({
        type: "proficiency",
        // missing category and item
      })
    ).toThrow();
  });
});
