import { describe, expect, it } from "vitest";
import {
  CharacterClassStateSchema,
  CharacterFlavorSchema,
  CharacterSaveSchema,
  CreateCharacterPayloadSchema,
  RaceConfigurationSchema,
} from "../character.js";
import { RuntimeModifierSchema, RuntimeModifiersListSchema } from "../modifiers.js";

describe("CharacterFlavorSchema", () => {
  it("accepts the minimal flavour payload", () => {
    expect(CharacterFlavorSchema.parse({ name: "Aragorn" })).toEqual({
      name: "Aragorn",
    });
  });

  it("rejects an empty name", () => {
    expect(() => CharacterFlavorSchema.parse({ name: "" })).toThrow();
  });
});

describe("RuntimeModifierSchema", () => {
  it("applies optional defaults", () => {
    const parsed = RuntimeModifierSchema.parse({
      id: "feat_lucky_0",
      sourceName: "Lucky",
      sourceOrigin: "feat",
      type: "add",
      target: "ARMOR_CLASS",
      scalingFactor: "none",
      isActive: true,
    });

    expect(parsed).toMatchObject({
      id: "feat_lucky_0",
      value: 0,
      requiredStates: [],
      forbiddenStates: [],
    });
  });

  it("accepts an empty modifiers list", () => {
    expect(RuntimeModifiersListSchema.parse(undefined)).toEqual([]);
  });
});

describe("RaceConfigurationSchema", () => {
  it("requires a subrace when hasSubraces is true", () => {
    expect(() =>
      RaceConfigurationSchema.parse({
        baseRaceId: "elf",
        hasSubraces: true,
        subraceId: null,
      }),
    ).toThrow(/subrace must be explicitly selected/i);
  });

  it("defaults subraceId to null", () => {
    const parsed = RaceConfigurationSchema.parse({
      baseRaceId: "human",
      hasSubraces: false,
    });

    expect(parsed.subraceId).toBeNull();
  });
});

describe("CharacterClassStateSchema", () => {
  it("defaults selections to an empty object", () => {
    const parsed = CharacterClassStateSchema.parse({
      classId: "fighter",
      level: 1,
    });

    expect(parsed.selections).toEqual({});
  });
});

describe("CharacterSaveSchema", () => {
  const validSave = {
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
      },
    ],
    hp: {
      current: 12,
      baseRolledHp: 12,
    },
  };

  it("accepts valid character save data", () => {
    const parsed = CharacterSaveSchema.parse(validSave);
    expect(parsed.hp.temporary).toBe(0);
    expect(parsed.traitSelections).toEqual({});
  });

  it("rejects empty class progression", () => {
    expect(() => CharacterSaveSchema.parse({ ...validSave, classes: [] })).toThrow();
  });
});

describe("CreateCharacterPayloadSchema", () => {
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
      ideals: "Duty and honour",
      bonds: "Loyal to friends",
      flaws: "Can be reckless",
    },
  };

  it("accepts valid payload", () => {
    const parsed = CreateCharacterPayloadSchema.parse(validPayload);
    expect(parsed.startingEquipment).toEqual({ given: [], choices: [] });
  });

  it("rejects out-of-range base ability scores", () => {
    expect(() =>
      CreateCharacterPayloadSchema.parse({
        ...validPayload,
        baseAbilityScores: { ...validPayload.baseAbilityScores, str: 2 },
      }),
    ).toThrow();
  });
});
