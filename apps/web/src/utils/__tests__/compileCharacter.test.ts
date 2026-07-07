/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { compileCharacterPayload } from "../compileCharacter";

describe("compileCharacterPayload", () => {
  const validState: any = {
    campaignId: "11111111-1111-1111-1111-111111111111",
    characterName: "Aragorn",
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
    backgroundType: "PRESET",
    backgroundId: "soldier",
    customBackground: null,
    personality: {
      traits: "Bold",
      ideals: "Duty",
      bonds: "Friends",
      flaws: "Reckless",
    },
    selectedClassEquipmentChoices: {
      0: [
        { itemId: "longsword", quantity: 1 },
        { itemId: "shield", quantity: 1 },
      ],
      1: [{ itemId: "crossbow_bolt", quantity: 20 }],
    },
  };

  it("compiles valid wizard state to character payload", () => {
    const result = compileCharacterPayload(validState);

    expect(result).toEqual({
      campaignId: "11111111-1111-1111-1111-111111111111",
      name: "Aragorn",
      raceId: "human",
      subraceId: null,
      classId: "fighter",
      subclassId: null,
      baseAbilityScores: validState.baseAbilityScores,
      alignment: "Lawful Good",
      background: {
        type: "PRESET",
        presetId: "soldier",
        customData: null,
      },
      personality: validState.personality,
      startingEquipment: [
        { itemId: "longsword", quantity: 1 },
        { itemId: "shield", quantity: 1 },
        { itemId: "crossbow_bolt", quantity: 20 },
      ],
    });
  });

  it("trims character name whitespace", () => {
    const state = { ...validState, characterName: "  Legolas  " };
    const result = compileCharacterPayload(state);

    expect(result.name).toBe("Legolas");
  });

  it("handles custom background", () => {
    const customBg = {
      name: "Noble",
      featureName: "Position of Privilege",
      featureDescription: "Thanks to your noble birth",
      skillTraitIds: ["skill_insight"],
      toolLanguageTraitIds: ["lang_noble"],
    };

    const state = {
      ...validState,
      backgroundType: "CUSTOM",
      backgroundId: null,
      customBackground: customBg,
    };

    const result = compileCharacterPayload(state);

    expect(result.background).toEqual({
      type: "CUSTOM",
      presetId: null,
      customData: customBg,
    });
  });

  it("handles preset background", () => {
    const state = {
      ...validState,
      backgroundType: "PRESET",
      backgroundId: "criminal",
    };

    const result = compileCharacterPayload(state);

    expect(result.background.type).toBe("PRESET");
    expect(result.background.presetId).toBe("criminal");
    expect(result.background.customData).toBeNull();
  });

  it("preserves ability scores exactly", () => {
    const scores = {
      str: 3,
      dex: 18,
      con: 15,
      int: 8,
      wis: 16,
      cha: 10,
    };

    const state = { ...validState, baseAbilityScores: scores };
    const result = compileCharacterPayload(state);

    expect(result.baseAbilityScores).toEqual(scores);
  });

  it("preserves personality traits", () => {
    const personality = {
      traits: "Stoic and calm",
      ideals: "Justice above all",
      bonds: "Loyal to the party",
      flaws: "Distrustful of magic",
    };

    const state = { ...validState, personality };
    const result = compileCharacterPayload(state);

    expect(result.personality).toEqual(personality);
  });

  it("handles null subrace ID correctly", () => {
    const state = { ...validState, subraceId: null };
    const result = compileCharacterPayload(state);

    expect(result.subraceId).toBeNull();
  });

  it("preserves subrace ID when provided", () => {
    const state = { ...validState, subraceId: "high_elf" };
    const result = compileCharacterPayload(state);

    expect(result.subraceId).toBe("high_elf");
  });

  it("handles special characters in personality", () => {
    const personality = {
      traits: "I love \"heroic\" deeds",
      ideals: "Justice (at any cost)",
      bonds: "My family - they're everything",
      flaws: "I'm overly cautious & paranoid",
    };

    const state = { ...validState, personality };
    const result = compileCharacterPayload(state);

    expect(result.personality).toEqual(personality);
  });

  it("returns CreateCharacterPayload with all required fields", () => {
    const result = compileCharacterPayload(validState);

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("raceId");
    expect(result).toHaveProperty("classId");
    expect(result).toHaveProperty("baseAbilityScores");
    expect(result).toHaveProperty("background");
    expect(result).toHaveProperty("personality");
    expect(result).toHaveProperty("alignment");
    expect(result).toHaveProperty("startingEquipment");
  });

  it("flattens selected class equipment choices", () => {
    const state = {
      ...validState,
      selectedClassEquipmentChoices: {
        0: [{ itemId: "dagger", quantity: 2 }],
        2: [
          { itemId: "rope", quantity: 1 },
          { itemId: "torch", quantity: 5 },
        ],
      },
    };

    const result = compileCharacterPayload(state);

    expect(result.startingEquipment).toEqual([
      { itemId: "dagger", quantity: 2 },
      { itemId: "rope", quantity: 1 },
      { itemId: "torch", quantity: 5 },
    ]);
  });

  it("omits campaignId when no campaign is selected", () => {
    const state = { ...validState, campaignId: null };
    const result = compileCharacterPayload(state);
    expect(result.campaignId).toBeUndefined();
  });
});
