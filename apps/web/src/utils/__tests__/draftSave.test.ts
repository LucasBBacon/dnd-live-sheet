/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildDraftSave, choicesFromAnswers } from "../draftSave";

const validState: any = {
  raceId: "race_human",
  subraceId: null,
  raceRequiresSubrace: false,
  classId: "class_fighter",
  subclassId: null,
  backgroundType: "PRESET",
  backgroundId: "background_soldier",
  baseAbilityScores: {
    STR: 15,
    DEX: 14,
    CON: 13,
    INT: 12,
    WIS: 10,
    CHA: 8,
  },
  choiceAnswers: {},
};

describe("buildDraftSave", () => {
  it("returns null when no race is chosen", () => {
    const state = { ...validState, raceId: null };
    expect(buildDraftSave(state)).toBeNull();
  });

  it("returns null when no class is chosen", () => {
    const state = { ...validState, classId: null };
    expect(buildDraftSave(state)).toBeNull();
  });

  it("returns null when neither race nor class is chosen", () => {
    const state = { ...validState, raceId: null, classId: null };
    expect(buildDraftSave(state)).toBeNull();
  });

  it("builds race from raceId, subraceId and raceRequiresSubrace", () => {
    const state = {
      ...validState,
      raceId: "race_elf",
      subraceId: "subrace_high_elf",
      raceRequiresSubrace: true,
    };

    const save = buildDraftSave(state);

    expect(save?.race).toEqual({
      baseRaceId: "race_elf",
      subraceId: "subrace_high_elf",
      hasSubraces: true,
    });
  });

  it("builds one class with level 1 and no subclassId when none is chosen", () => {
    const save = buildDraftSave(validState);

    expect(save?.classes).toEqual([
      {
        classId: "class_fighter",
        level: 1,
        selections: {},
      },
    ]);
  });

  it("includes subclassId on the class when one is chosen", () => {
    const state = { ...validState, subclassId: "subclass_champion" };
    const save = buildDraftSave(state);

    expect(save?.classes).toEqual([
      {
        classId: "class_fighter",
        level: 1,
        subclassId: "subclass_champion",
        selections: {},
      },
    ]);
  });

  it("fills the class's selections from class-target choiceAnswers for that classId", () => {
    const state = {
      ...validState,
      choiceAnswers: {
        fighter_level_1_fighting_style: {
          target: "class",
          classId: "class_fighter",
          selected: ["trait_fs_archery"],
        },
        // a stale answer for a class that is no longer selected - must not
        // leak onto class_fighter's selections
        rogue_expertise: {
          target: "class",
          classId: "class_rogue",
          selected: ["stealth"],
        },
      },
    };

    const save = buildDraftSave(state);

    expect(save?.classes[0].selections).toEqual({
      fighter_level_1_fighting_style: ["trait_fs_archery"],
    });
  });

  it("fills traitSelections from trait-target choiceAnswers", () => {
    const state = {
      ...validState,
      choiceAnswers: {
        human_language_choice: {
          target: "trait",
          selected: ["dwarvish"],
        },
      },
    };

    const save = buildDraftSave(state);

    expect(save?.traitSelections).toEqual({
      human_language_choice: ["dwarvish"],
    });
  });

  it("includes backgroundId only for a PRESET background", () => {
    const save = buildDraftSave(validState);
    expect(save?.backgroundId).toBe("background_soldier");
  });

  it("omits backgroundId for a CUSTOM background", () => {
    const state = { ...validState, backgroundType: "CUSTOM" };
    const save = buildDraftSave(state);
    expect(save?.backgroundId).toBeUndefined();
  });

  it("omits backgroundId when no background is chosen yet", () => {
    const state = { ...validState, backgroundType: null, backgroundId: null };
    const save = buildDraftSave(state);
    expect(save?.backgroundId).toBeUndefined();
  });

  it("returns an empty feats array", () => {
    const save = buildDraftSave(validState);
    expect(save?.feats).toEqual([]);
  });

  it("lower-cases baseAbilityScores into attributes", () => {
    const save = buildDraftSave(validState);

    expect(save?.attributes).toEqual({
      str: 15,
      dex: 14,
      con: 13,
      int: 12,
      wis: 10,
      cha: 8,
    });
  });
});

describe("choicesFromAnswers", () => {
  it("returns empty maps and an empty feats array for no answers", () => {
    expect(choicesFromAnswers({})).toEqual({
      classSelections: {},
      traitSelections: {},
      feats: [],
    });
  });

  it("nests a class-target answer under classSelections[classId][questionId]", () => {
    const result = choicesFromAnswers({
      fighter_level_1_fighting_style: {
        target: "class",
        classId: "class_fighter",
        selected: ["trait_fs_archery"],
      },
    });

    expect(result.classSelections).toEqual({
      class_fighter: {
        fighter_level_1_fighting_style: ["trait_fs_archery"],
      },
    });
  });

  it("groups multiple class-target answers for the same classId", () => {
    const result = choicesFromAnswers({
      fighter_level_1_fighting_style: {
        target: "class",
        classId: "class_fighter",
        selected: ["trait_fs_archery"],
      },
      fighter_starting_skills: {
        target: "class",
        classId: "class_fighter",
        selected: ["athletics"],
      },
    });

    expect(result.classSelections).toEqual({
      class_fighter: {
        fighter_level_1_fighting_style: ["trait_fs_archery"],
        fighter_starting_skills: ["athletics"],
      },
    });
  });

  it("separates answers for different classIds", () => {
    const result = choicesFromAnswers({
      fighter_level_1_fighting_style: {
        target: "class",
        classId: "class_fighter",
        selected: ["trait_fs_archery"],
      },
      rogue_expertise: {
        target: "class",
        classId: "class_rogue",
        selected: ["stealth"],
      },
    });

    expect(result.classSelections).toEqual({
      class_fighter: {
        fighter_level_1_fighting_style: ["trait_fs_archery"],
      },
      class_rogue: {
        rogue_expertise: ["stealth"],
      },
    });
  });

  it("keys a trait-target answer directly by questionId", () => {
    const result = choicesFromAnswers({
      human_language_choice: {
        target: "trait",
        selected: ["dwarvish"],
      },
    });

    expect(result.traitSelections).toEqual({
      human_language_choice: ["dwarvish"],
    });
  });

  it("always returns an empty feats array", () => {
    const result = choicesFromAnswers({
      human_language_choice: { target: "trait", selected: ["dwarvish"] },
    });

    expect(result.feats).toEqual([]);
  });
});
