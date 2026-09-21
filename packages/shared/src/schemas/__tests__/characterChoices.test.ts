import { describe, expect, it } from "vitest";
import {
  CharacterChoicesSchema,
  emptyCharacterChoices,
} from "../runtime/characterSave.js";
import { CreateCharacterPayloadSchema } from "../transport/createCharacter.js";

describe("CharacterChoicesSchema", () => {
  it("parses class selections by class then node, and trait selections by block", () => {
    const choices = {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    };

    expect(CharacterChoicesSchema.parse(choices)).toEqual({ ...choices, feats: [] });
  });

  it("defaults both maps, so an empty stored value is a valid one", () => {
    expect(CharacterChoicesSchema.parse({})).toEqual(emptyCharacterChoices());
    expect(emptyCharacterChoices()).toEqual({
      classSelections: {},
      traitSelections: {},
      feats: [],
    });
  });

  it("rejects a class selection that is not a map of picks", () => {
    expect(
      CharacterChoicesSchema.safeParse({ classSelections: { class_fighter: "x" } })
        .success,
    ).toBe(false);
  });

  it("keeps the feats taken, in order", () => {
    expect(
      CharacterChoicesSchema.parse({ feats: ["feat_alert", "feat_tough"] }).feats,
    ).toEqual(["feat_alert", "feat_tough"]);
  });
});

describe("CreateCharacterPayloadSchema choices", () => {
  const payload = {
    name: "Lyra",
    raceId: "race_half_elf",
    subraceId: null,
    classId: "class_bard",
    subclassId: null,
    baseAbilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 15 },
    alignment: "Chaotic Good",
    background: { type: "PRESET", presetId: "background_noble", customData: null },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
  };

  it("accepts a payload without choices", () => {
    expect(CreateCharacterPayloadSchema.parse(payload).choices).toBeUndefined();
  });

  it("carries choices when they are sent", () => {
    const choices = {
      classSelections: {},
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    expect(
      CreateCharacterPayloadSchema.parse({ ...payload, choices }).choices,
    ).toEqual({ ...choices, feats: [] });
  });
});
