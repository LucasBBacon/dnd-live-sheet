import { describe, expect, it } from "vitest";
import {
  CharacterFlavorSchema,
  ModifierSchema,
  ModifiersList,
  RaceConfigurationSchema,
  ClassProgressionSchema,
  CharacterEngineSchema,
  BaseCharacterSchema,
  CreateCharacterPayloadSchema,
} from "../character.js";

describe("Character Flavor Schema", () => {
  it("accepts valid flavor data with all fields", () => {
    const data = {
      name: "Aragorn",
      alignment: "Lawful Good",
      eyeColor: "Grey",
      backstory: "A ranger who lived in the wild.",
    };
    expect(CharacterFlavorSchema.parse(data)).toEqual(data);
  });

  it("accepts minimal flavor data with only name", () => {
    const data = { name: "Legolas" };
    expect(CharacterFlavorSchema.parse(data)).toEqual(data);
  });

  it("rejects empty name", () => {
    expect(() => CharacterFlavorSchema.parse({ name: "" })).toThrow();
  });

  it("rejects name exceeding max length (100)", () => {
    const longName = "a".repeat(101);
    expect(() => CharacterFlavorSchema.parse({ name: longName })).toThrow();
  });

  it("accepts name at max boundary (100 chars)", () => {
    const maxName = "a".repeat(100);
    const result = CharacterFlavorSchema.parse({ name: maxName });
    expect(result.name.length).toBe(100);
  });

  it("rejects backstory exceeding max length (5000)", () => {
    const longBackstory = "a".repeat(5001);
    expect(() =>
      CharacterFlavorSchema.parse({ name: "Test", backstory: longBackstory })
    ).toThrow();
  });

  it("accepts backstory at max boundary (5000 chars)", () => {
    const maxBackstory = "b".repeat(5000);
    const result = CharacterFlavorSchema.parse({
      name: "Test",
      backstory: maxBackstory,
    });
    expect(result.backstory?.length).toBe(5000);
  });

  it("rejects non-string name", () => {
    expect(() => CharacterFlavorSchema.parse({ name: 123 })).toThrow();
  });

  it("has optional fields for alignment, eyeColor, and backstory", () => {
    const minimal = { name: "Test" };
    const result = CharacterFlavorSchema.parse(minimal);
    expect(result.alignment).toBeUndefined();
    expect(result.eyeColor).toBeUndefined();
    expect(result.backstory).toBeUndefined();
  });
});

describe("Modifier Schema", () => {
  const validModifier = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    sourceId: "feat_lucky",
    type: "bonus",
    target: "ac",
    value: 2,
  };

  it("accepts valid modifier with all required fields", () => {
    expect(ModifierSchema.parse(validModifier)).toEqual(validModifier);
  });

  it("accepts modifier without optional value field", () => {
    const noValue = { ...validModifier, value: undefined };
    const result = ModifierSchema.parse(noValue);
    expect(result.value).toBeUndefined();
  });

  it("accepts all modifier types", () => {
    const types = [
      "bonus",
      "advantage",
      "disadvantage",
      "resistance",
      "immunity",
    ] as const;
    types.forEach((type) => {
      expect(
        ModifierSchema.parse({ ...validModifier, type })
      ).toHaveProperty("type", type);
    });
  });

  it("rejects invalid modifier type", () => {
    expect(() =>
      ModifierSchema.parse({ ...validModifier, type: "invalid_type" })
    ).toThrow();
  });

  it("rejects invalid UUID", () => {
    expect(() =>
      ModifierSchema.parse({ ...validModifier, id: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects non-integer value", () => {
    expect(() =>
      ModifierSchema.parse({ ...validModifier, value: 2.5 })
    ).toThrow();
  });

  it("accepts negative value", () => {
    const result = ModifierSchema.parse({ ...validModifier, value: -3 });
    expect(result.value).toBe(-3);
  });

  it("accepts zero value", () => {
    const result = ModifierSchema.parse({ ...validModifier, value: 0 });
    expect(result.value).toBe(0);
  });
});

describe("Modifiers List Schema", () => {
  it("accepts empty array", () => {
    const result = ModifiersList.parse([]);
    expect(result).toEqual([]);
  });

  it("has default value of empty array", () => {
    const result = ModifiersList.parse(undefined);
    expect(result).toEqual([]);
  });

  it("accepts array of valid modifiers", () => {
    const modifiers = [
      {
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        sourceId: "feat_lucky",
        type: "bonus",
        target: "ac",
        value: 2,
      },
      {
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d480",
        sourceId: "spell_shield",
        type: "bonus",
        target: "ac",
        value: 5,
      },
    ];
    const result = ModifiersList.parse(modifiers);
    expect(result).toHaveLength(2);
  });

  it("rejects non-array input", () => {
    expect(() => ModifiersList.parse({ invalid: true })).toThrow();
  });
});

describe("Race Configuration Schema", () => {
  it("accepts valid race without subraces required", () => {
    const data = {
      baseRaceId: "human",
      hasSubraces: false,
      subraceId: null,
    };
    expect(RaceConfigurationSchema.parse(data)).toEqual(data);
  });

  it("accepts valid race with subraces when selected", () => {
    const data = {
      baseRaceId: "elf",
      hasSubraces: true,
      subraceId: "high_elf",
    };
    expect(RaceConfigurationSchema.parse(data)).toEqual(data);
  });

  it("requires subraceId when hasSubraces is true", () => {
    const data = {
      baseRaceId: "elf",
      hasSubraces: true,
      subraceId: null,
    };
    expect(() => RaceConfigurationSchema.parse(data)).toThrow(
      /subrace must be explicitly selected/i
    );
  });

  it("allows subraceId to be null when hasSubraces is false", () => {
    const data = {
      baseRaceId: "human",
      hasSubraces: false,
      subraceId: null,
    };
    expect(RaceConfigurationSchema.parse(data)).toEqual(data);
  });

  it("rejects empty baseRaceId", () => {
    expect(() =>
      RaceConfigurationSchema.parse({
        baseRaceId: "",
        hasSubraces: false,
        subraceId: null,
      })
    ).toThrow();
  });

  it("defaults subraceId to null", () => {
    const data = {
      baseRaceId: "dwarf",
      hasSubraces: false,
    };
    const result = RaceConfigurationSchema.parse(data);
    expect(result.subraceId).toBeNull();
  });
});

describe("Class Progression Schema", () => {
  it("accepts valid class progression without subclass required", () => {
    const data = {
      classId: "fighter",
      level: 1,
      subclassRequirementLevel: 3,
      subclassId: null,
    };
    expect(ClassProgressionSchema.parse(data)).toEqual(data);
  });

  it("accepts valid class progression with subclass at level 3", () => {
    const data = {
      classId: "fighter",
      level: 3,
      subclassRequirementLevel: 3,
      subclassId: "champion",
    };
    expect(ClassProgressionSchema.parse(data)).toEqual(data);
  });

  it("requires subclass at or above subclassRequirementLevel", () => {
    expect(() =>
      ClassProgressionSchema.parse({
        classId: "rogue",
        level: 3,
        subclassRequirementLevel: 3,
        subclassId: null,
      })
    ).toThrow(/subclass must be selected/i);
  });

  it("allows null subclass below subclassRequirementLevel", () => {
    const data = {
      classId: "wizard",
      level: 2,
      subclassRequirementLevel: 3,
      subclassId: null,
    };
    expect(ClassProgressionSchema.parse(data)).toEqual(data);
  });

  it("rejects level below 1", () => {
    expect(() =>
      ClassProgressionSchema.parse({
        classId: "fighter",
        level: 0,
        subclassRequirementLevel: 3,
        subclassId: null,
      })
    ).toThrow();
  });

  it("rejects level above 20", () => {
    expect(() =>
      ClassProgressionSchema.parse({
        classId: "fighter",
        level: 21,
        subclassRequirementLevel: 3,
        subclassId: null,
      })
    ).toThrow();
  });

  it("accepts level boundaries (1 and 20)", () => {
    expect(
      ClassProgressionSchema.parse({
        classId: "fighter",
        level: 1,
        subclassRequirementLevel: 3,
        subclassId: null,
      })
    ).toBeDefined();

    expect(
      ClassProgressionSchema.parse({
        classId: "fighter",
        level: 20,
        subclassRequirementLevel: 3,
        subclassId: "champion",
      })
    ).toBeDefined();
  });

  it("rejects non-integer level", () => {
    expect(() =>
      ClassProgressionSchema.parse({
        classId: "fighter",
        level: 3.5,
        subclassRequirementLevel: 3,
        subclassId: null,
      })
    ).toThrow();
  });
});

describe("Character Engine Schema", () => {
  const validEngine = {
    attributes: {
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    },
    race: {
      baseRaceId: "human",
      hasSubraces: false,
      subraceId: null,
    },
    classes: [
      {
        classId: "fighter",
        level: 1,
        subclassRequirementLevel: 3,
        subclassId: null,
      },
    ],
    hp: {
      max: 12,
      current: 12,
      temporary: 0,
    },
    globalModifiers: [],
  };

  it("accepts valid character engine data", () => {
    expect(CharacterEngineSchema.parse(validEngine)).toBeDefined();
  });

  it("requires at least one class", () => {
    const noClasses = { ...validEngine, classes: [] };
    expect(() => CharacterEngineSchema.parse(noClasses)).toThrow();
  });

  it("rejects ability scores below 1", () => {
    const lowScore = {
      ...validEngine,
      attributes: { ...validEngine.attributes, str: 0 },
    };
    expect(() => CharacterEngineSchema.parse(lowScore)).toThrow();
  });

  it("rejects ability scores above 30", () => {
    const highScore = {
      ...validEngine,
      attributes: { ...validEngine.attributes, dex: 31 },
    };
    expect(() => CharacterEngineSchema.parse(highScore)).toThrow();
  });

  it("accepts ability scores at boundaries (1 and 30)", () => {
    const boundaryScores = {
      ...validEngine,
      attributes: {
        str: 1,
        dex: 30,
        con: 15,
        int: 15,
        wis: 15,
        cha: 15,
      },
    };
    expect(CharacterEngineSchema.parse(boundaryScores)).toBeDefined();
  });

  it("requires positive max HP", () => {
    const noHP = { ...validEngine, hp: { max: 0, current: 0, temporary: 0 } };
    expect(() => CharacterEngineSchema.parse(noHP)).toThrow();
  });

  it("rejects negative current HP", () => {
    const negCurrent = {
      ...validEngine,
      hp: { max: 12, current: -1, temporary: 0 },
    };
    expect(() => CharacterEngineSchema.parse(negCurrent)).toThrow();
  });

  it("rejects negative temporary HP", () => {
    const negTemp = { ...validEngine, hp: { max: 12, current: 10, temporary: -1 } };
    expect(() => CharacterEngineSchema.parse(negTemp)).toThrow();
  });

  it("defaults temporary HP to 0", () => {
    const noTemp = { ...validEngine, hp: { max: 12, current: 12 } };
    const result = CharacterEngineSchema.parse(noTemp);
    expect(result.hp.temporary).toBe(0);
  });
});

describe("Base Character Schema", () => {
  const validCharacter = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    userId: "user123",
    flavor: {
      name: "Aragorn",
      alignment: "Lawful Good",
      eyeColor: "Grey",
      backstory: "A ranger who lived in the wild.",
    },
    engine: {
      attributes: {
        str: 15,
        dex: 14,
        con: 13,
        int: 12,
        wis: 10,
        cha: 8,
      },
      race: {
        baseRaceId: "human",
        hasSubraces: false,
        subraceId: null,
      },
      classes: [
        {
          classId: "fighter",
          level: 1,
          subclassRequirementLevel: 3,
          subclassId: null,
        },
      ],
      hp: {
        max: 12,
        current: 12,
        temporary: 0,
      },
      globalModifiers: [],
    },
  };

  it("accepts valid character", () => {
    expect(BaseCharacterSchema.parse(validCharacter)).toBeDefined();
  });

  it("rejects invalid UUID for id", () => {
    const badId = { ...validCharacter, id: "not-uuid" };
    expect(() => BaseCharacterSchema.parse(badId)).toThrow();
  });

  it("rejects missing userId", () => {
    const noUserId = { ...validCharacter, userId: undefined };
    expect(() => BaseCharacterSchema.parse(noUserId)).toThrow();
  });
});

describe("Create Character Payload Schema", () => {
  const validPayload = {
    name: "Aragorn",
    raceId: "human",
    subraceId: null,
    classId: "fighter",
    subclassId: null,
    baseAbilityScores: {
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    },
    alignment: "Lawful Good",
    background: {
      type: "PRESET",
      presetId: "soldier",
      customData: null,
    },
    personality: {
      traits: "Bold and determined",
      ideals: "Duty and honor",
      bonds: "Loyal to friends",
      flaws: "Can be reckless",
    },
  };

  it("accepts valid character creation payload", () => {
    expect(CreateCharacterPayloadSchema.parse(validPayload)).toBeDefined();
  });

  it("accepts custom background", () => {
    const customBg = {
      ...validPayload,
      background: {
        type: "CUSTOM",
        presetId: null,
        customData: {
          name: "Custom Background",
          featureName: "Custom Feature",
          featureDescription: "A custom feature description",
          skillTraitIds: ["skill_stealth"],
          toolLanguageTraitIds: ["lang_draconic"],
        },
      },
    };
    expect(CreateCharacterPayloadSchema.parse(customBg)).toBeDefined();
  });

  it("requires name", () => {
    const noName = { ...validPayload, name: undefined };
    expect(() => CreateCharacterPayloadSchema.parse(noName)).toThrow();
  });

  it("rejects empty name", () => {
    const emptyName = { ...validPayload, name: "" };
    expect(() => CreateCharacterPayloadSchema.parse(emptyName)).toThrow();
  });

  it("rejects ability scores below 3", () => {
    const lowScore = {
      ...validPayload,
      baseAbilityScores: { ...validPayload.baseAbilityScores, str: 2 },
    };
    expect(() => CreateCharacterPayloadSchema.parse(lowScore)).toThrow();
  });

  it("rejects ability scores above 18", () => {
    const highScore = {
      ...validPayload,
      baseAbilityScores: { ...validPayload.baseAbilityScores, dex: 19 },
    };
    expect(() => CreateCharacterPayloadSchema.parse(highScore)).toThrow();
  });

  it("accepts ability scores at boundaries (3 and 18)", () => {
    const boundaryScores = {
      ...validPayload,
      baseAbilityScores: {
        str: 3,
        dex: 18,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
      },
    };
    expect(CreateCharacterPayloadSchema.parse(boundaryScores)).toBeDefined();
  });

  it("requires all ability scores", () => {
    const missing = {
      ...validPayload,
      baseAbilityScores: {
        ...validPayload.baseAbilityScores,
        str: undefined,
      },
    };
    expect(() => CreateCharacterPayloadSchema.parse(missing)).toThrow();
  });

  it("rejects extra fields in baseAbilityScores (strict mode)", () => {
    const extra = {
      ...validPayload,
      baseAbilityScores: {
        ...validPayload.baseAbilityScores,
        extra: 99,
      },
    };
    expect(() => CreateCharacterPayloadSchema.parse(extra)).toThrow();
  });

  it("requires valid background type", () => {
    const badBgType = {
      ...validPayload,
      background: {
        type: "INVALID",
        presetId: null,
        customData: null,
      },
    };
    expect(() => CreateCharacterPayloadSchema.parse(badBgType)).toThrow();
  });

  it("accepts null subclass at level 1", () => {
    const data = { ...validPayload, subclassId: null };
    expect(CreateCharacterPayloadSchema.parse(data)).toBeDefined();
  });
});
