import { describe, expect, it } from "vitest";
import { AbilityMinimumsSchema, FeatPrerequisitesSchema } from "../prerequisites.js";

describe("Ability Minimums Schema", () => {
  it("accepts empty object (all optional)", () => {
    expect(AbilityMinimumsSchema.parse({})).toEqual({});
  });

  it("accepts object with single ability minimum", () => {
    expect(AbilityMinimumsSchema.parse({ str: 13 })).toEqual({ str: 13 });
  });

  it("accepts all ability score minimums", () => {
    const data = {
      str: 13,
      dex: 14,
      con: 15,
      int: 16,
      wis: 17,
      cha: 18,
    };
    expect(AbilityMinimumsSchema.parse(data)).toEqual(data);
  });

  it("requires ability scores within valid range (1-30)", () => {
    expect(AbilityMinimumsSchema.parse({ str: 1 })).toBeDefined();
    expect(AbilityMinimumsSchema.parse({ dex: 30 })).toBeDefined();
  });

  it("rejects ability scores below 1", () => {
    expect(() => AbilityMinimumsSchema.parse({ str: 0 })).toThrow();
  });

  it("rejects ability scores above 30", () => {
    expect(() => AbilityMinimumsSchema.parse({ cha: 31 })).toThrow();
  });

  it("accepts ability score boundaries", () => {
    expect(AbilityMinimumsSchema.parse({ str: 1, dex: 30 })).toBeDefined();
  });

  it("rejects non-integer ability scores", () => {
    expect(() => AbilityMinimumsSchema.parse({ int: 15.5 })).toThrow();
  });

  it("ignores null/undefined values in optional fields", () => {
    const result = AbilityMinimumsSchema.parse({ str: undefined, wis: 12 });
    expect(result.wis).toBe(12);
    expect(result.str).toBeUndefined();
  });
});

describe("Feat Prerequisites Schema", () => {
  it("accepts empty prerequisites (no requirements)", () => {
    expect(FeatPrerequisitesSchema.parse({})).toEqual({});
  });

  it("accepts minimum level requirement", () => {
    expect(FeatPrerequisitesSchema.parse({ minimumLevel: 5 })).toEqual({
      minimumLevel: 5,
    });
  });

  it("accepts level boundaries (1-20)", () => {
    expect(FeatPrerequisitesSchema.parse({ minimumLevel: 1 })).toBeDefined();
    expect(FeatPrerequisitesSchema.parse({ minimumLevel: 20 })).toBeDefined();
  });

  it("rejects level below 1", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ minimumLevel: 0 })
    ).toThrow();
  });

  it("rejects level above 20", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ minimumLevel: 21 })
    ).toThrow();
  });

  it("accepts ability minimums", () => {
    const prereq = {
      abilityMinimums: {
        str: 13,
        dex: 14,
      },
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts required class IDs", () => {
    const prereq = {
      requiredClassIds: ["fighter", "paladin"],
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts empty required class IDs array", () => {
    expect(FeatPrerequisitesSchema.parse({ requiredClassIds: [] })).toBeDefined();
  });

  it("accepts required subclass IDs", () => {
    const prereq = {
      requiredSubclassIds: ["champion", "battlemaster"],
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts required race IDs", () => {
    const prereq = {
      requiredRaceIds: ["elf", "dwarf"],
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts required subrace IDs", () => {
    const prereq = {
      requiredSubraceIds: ["high_elf", "wood_elf"],
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts spellcasting requirement flag", () => {
    expect(
      FeatPrerequisitesSchema.parse({ requiresSpellcasting: true })
    ).toBeDefined();
    expect(
      FeatPrerequisitesSchema.parse({ requiresSpellcasting: false })
    ).toBeDefined();
  });

  it("accepts required feat IDs (for ETL compatibility)", () => {
    const prereq = {
      requiredFeatIds: ["great_weapon_master", "polearm_master"],
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("accepts comprehensive prerequisites", () => {
    const complex = {
      minimumLevel: 8,
      abilityMinimums: {
        str: 13,
        wis: 15,
      },
      requiredClassIds: ["fighter", "paladin"],
      requiredSubclassIds: ["champion"],
      requiredRaceIds: ["human"],
      requiredSubraceIds: ["high_elf"],
      requiresSpellcasting: true,
      requiredFeatIds: ["great_weapon_master"],
    };
    expect(FeatPrerequisitesSchema.parse(complex)).toBeDefined();
  });

  it("enforces strict mode - no unknown fields", () => {
    const badField = {
      minimumLevel: 5,
      unknownField: "should not be allowed",
    };
    expect(() => FeatPrerequisitesSchema.parse(badField)).toThrow();
  });

  it("rejects non-array for class IDs", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ requiredClassIds: "fighter" })
    ).toThrow();
  });

  it("rejects non-array for subclass IDs", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ requiredSubclassIds: "champion" })
    ).toThrow();
  });

  it("rejects non-boolean for requiresSpellcasting", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ requiresSpellcasting: "yes" })
    ).toThrow();
  });

  it("rejects non-integer level", () => {
    expect(() =>
      FeatPrerequisitesSchema.parse({ minimumLevel: 5.5 })
    ).toThrow();
  });

  it("accepts multiple ability score minimums together", () => {
    const prereq = {
      abilityMinimums: {
        str: 15,
        con: 14,
        wis: 13,
      },
    };
    expect(FeatPrerequisitesSchema.parse(prereq)).toBeDefined();
  });

  it("handles complex feat chains with multiple race requirements", () => {
    const chained = {
      minimumLevel: 4,
      requiredRaceIds: ["elf", "half_elf", "dragonborn"],
      abilityMinimums: {
        dex: 13,
      },
    };
    expect(FeatPrerequisitesSchema.parse(chained)).toBeDefined();
  });

  it("allows spellcasting with specific subclass requirements", () => {
    const spellFeat = {
      requiresSpellcasting: true,
      requiredSubclassIds: ["eldritch_knight"],
    };
    expect(FeatPrerequisitesSchema.parse(spellFeat)).toBeDefined();
  });

  it("documents ETL compatibility for required feats", () => {
    // This test documents that requiredFeatIds is stored for compatibility
    // but the database uses feat_prerequisites_feats junction table
    const withFeatDeps = {
      requiredFeatIds: ["alert", "observant"],
      minimumLevel: 6,
    };
    expect(FeatPrerequisitesSchema.parse(withFeatDeps)).toBeDefined();
  });
});
