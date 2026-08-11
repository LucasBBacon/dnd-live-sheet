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
    // wizard state is keyed by the engine's uppercase Ability type
    baseAbilityScores: {
      STR: 15,
      DEX: 14,
      CON: 13,
      INT: 12,
      WIS: 10,
      CHA: 8,
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
    selectedClassEquipmentOptionIndices: {},
    selectedEquipmentCategoryChoices: {},
    classStartingEquipment: {
      given: [{ kind: "item", refId: "chain_mail", quantity: 1 }],
      choices: [],
    },
    presetBackgroundStartingEquipment: {
      given: [{ kind: "money", refId: "money_gp", quantity: 10 }],
      choices: [],
    },
    selectedClassEquipmentChoices: {
      0: [
        { kind: "item", refId: "longsword", quantity: 1 },
        { kind: "item", refId: "shield", quantity: 1 },
      ],
      1: [{ kind: "item", refId: "crossbow_bolt", quantity: 20 }],
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
      // payload contract is lowercase; compile translates at the boundary
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
      personality: validState.personality,
      startingEquipment: {
        given: [
          { kind: "item", refId: "chain_mail", quantity: 1 },
          { kind: "item", refId: "longsword", quantity: 1 },
          { kind: "item", refId: "shield", quantity: 1 },
          { kind: "item", refId: "crossbow_bolt", quantity: 20 },
          { kind: "money", refId: "money_gp", quantity: 10 },
        ],
        choices: [],
      },
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

    expect(result.startingEquipment.given).not.toContainEqual({
      kind: "money",
      refId: "money_gp",
      quantity: 10,
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

  it("preserves ability scores exactly, lowercasing keys for the payload", () => {
    const scores = {
      STR: 3,
      DEX: 18,
      CON: 15,
      INT: 8,
      WIS: 16,
      CHA: 10,
    };

    const state = { ...validState, baseAbilityScores: scores };
    const result = compileCharacterPayload(state);

    expect(result.baseAbilityScores).toEqual({
      str: 3,
      dex: 18,
      con: 15,
      int: 8,
      wis: 16,
      cha: 10,
    });
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
      traits: 'I love "heroic" deeds',
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

  it("merges guaranteed and selected starting equipment grants", () => {
    const state = {
      ...validState,
      selectedClassEquipmentChoices: {
        0: [{ kind: "item", refId: "dagger", quantity: 2 }],
        2: [
          { kind: "item", refId: "rope", quantity: 1 },
          { kind: "item", refId: "torch", quantity: 5 },
        ],
      },
    };

    const result = compileCharacterPayload(state);

    expect(result.startingEquipment).toEqual({
      given: [
        { kind: "item", refId: "chain_mail", quantity: 1 },
        { kind: "item", refId: "dagger", quantity: 2 },
        { kind: "item", refId: "rope", quantity: 1 },
        { kind: "item", refId: "torch", quantity: 5 },
        { kind: "money", refId: "money_gp", quantity: 10 },
      ],
      choices: [],
    });
  });

  it("omits campaignId when no campaign is selected", () => {
    const state = { ...validState, campaignId: null };
    const result = compileCharacterPayload(state);
    expect(result.campaignId).toBeUndefined();
  });

  it("resolves class and background category grants before submit", () => {
    const state = {
      ...validState,
      classStartingEquipment: {
        given: [
          { kind: "category", refId: "category_holy_symbol", quantity: 1 },
        ],
        choices: [],
      },
      presetBackgroundStartingEquipment: {
        given: [
          { kind: "category", refId: "category_arcane_focus", quantity: 1 },
        ],
        choices: [],
      },
      selectedEquipmentCategoryChoices: {
        "class-given:0": {
          kind: "item",
          refId: "item_holy_symbol_amulet",
          quantity: 1,
        },
        "background-given:0": {
          kind: "item",
          refId: "item_focus_wand",
          quantity: 1,
        },
      },
      selectedClassEquipmentChoices: {},
    };

    const result = compileCharacterPayload(state);

    expect(result.startingEquipment.given).toEqual([
      { kind: "item", refId: "item_holy_symbol_amulet", quantity: 1 },
      { kind: "item", refId: "item_focus_wand", quantity: 1 },
    ]);
  });
});
