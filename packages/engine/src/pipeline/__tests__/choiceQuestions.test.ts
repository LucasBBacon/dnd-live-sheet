import { describe, expect, it } from "vitest";
import type { CharacterSave } from "@project/shared";
import { choiceOptionLabel, listChoiceQuestions } from "../choiceQuestions.js";
import { corePackLookup } from "./corePackFixture.js";

const attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const hp = { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} };

const save = (overrides: Partial<CharacterSave> = {}): CharacterSave => ({
  attributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: {},
  feats: [],
  hp,
  ...overrides,
});

const snapshot = corePackLookup();

describe("listChoiceQuestions", () => {
  it("orders questions race, background, class for a human fighter with the acolyte background", () => {
    const characterSave = save({ backgroundId: "background_acolyte" });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(questions.map((q) => q.id)).toEqual([
      "human_language_choice",
      "acolyte_languages",
      "fighter_level_1_fighting_style",
      "fighter_starting_skills",
    ]);
  });

  it("labels the human's language block as a race-sourced trait question", () => {
    const characterSave = save({ backgroundId: "background_acolyte" });

    const questions = listChoiceQuestions(characterSave, snapshot);
    const languageQuestion = questions.find(
      (q) => q.id === "human_language_choice",
    )!;

    expect(languageQuestion.target).toBe("trait");
    expect(languageQuestion.source).toEqual({
      kind: "race",
      id: "race_human",
      name: "Human",
    });
    expect(languageQuestion.pickCount).toBe(1);
    expect(languageQuestion.selected).toEqual([]);
    expect(languageQuestion.options).toContainEqual({
      id: "dwarvish",
      label: "Dwarvish",
    });
  });

  it("labels the fighter's fighting-style node as a class question", () => {
    const characterSave = save({ backgroundId: "background_acolyte" });

    const questions = listChoiceQuestions(characterSave, snapshot);
    const styleQuestion = questions.find(
      (q) => q.id === "fighter_level_1_fighting_style",
    )!;

    expect(styleQuestion.target).toBe("class");
    expect(styleQuestion.classId).toBe("class_fighter");
    expect(styleQuestion.source).toEqual({
      kind: "class",
      id: "class_fighter",
      name: "Fighter",
    });
    expect(styleQuestion.pickCount).toBe(1);
    expect(styleQuestion.selected).toEqual([]);
    expect(styleQuestion.options).toContainEqual({
      id: "trait_fs_archery",
      label: "Fighting Style: Archery",
    });
  });

  it("labels a half-elf's ability-score, skill and language blocks", () => {
    const characterSave = save({
      race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
    });

    const questions = listChoiceQuestions(characterSave, snapshot);

    const asiQuestion = questions.find((q) => q.id === "half_elf_asi_choice")!;
    expect(asiQuestion.pickCount).toBe(2);
    expect(asiQuestion.options).toEqual([
      { id: "STR", label: "Strength" },
      { id: "DEX", label: "Dexterity" },
      { id: "CON", label: "Constitution" },
      { id: "INT", label: "Intelligence" },
      { id: "WIS", label: "Wisdom" },
    ]);
    expect(["race", "subrace"]).toContain(asiQuestion.source.kind);

    const skillQuestion = questions.find(
      (q) => q.id === "skill_versatility_choice",
    )!;
    expect(skillQuestion.pickCount).toBe(2);
    expect(["race", "subrace"]).toContain(skillQuestion.source.kind);

    const languageQuestion = questions.find(
      (q) => q.id === "half_elf_language_choice",
    )!;
    expect(languageQuestion.pickCount).toBe(1);
    expect(["race", "subrace"]).toContain(languageQuestion.source.kind);
  });

  it("returns stored answers in selected, for both class nodes and trait blocks", () => {
    const characterSave = save({
      classes: [
        {
          classId: "class_fighter",
          level: 1,
          selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
      ],
      traitSelections: { human_language_choice: ["dwarvish"] },
    });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(
      questions.find((q) => q.id === "fighter_level_1_fighting_style")!
        .selected,
    ).toEqual(["trait_fs_defense"]);
    expect(
      questions.find((q) => q.id === "human_language_choice")!.selected,
    ).toEqual(["dwarvish"]);
  });

  it("lists a background-granted skill as held on the class skill block that also offers it, but not the block's own picks", () => {
    const characterSave = save({
      backgroundId: "background_acolyte",
      classes: [
        {
          classId: "class_fighter",
          level: 1,
          selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
      ],
      traitSelections: { fighter_starting_skills: ["athletics"] },
    });

    const questions = listChoiceQuestions(characterSave, snapshot);
    const skillQuestion = questions.find(
      (q) => q.id === "fighter_starting_skills",
    )!;

    // insight comes from the acolyte background (already held); athletics was
    // just picked on this very block, so it is an answer, not a held item
    expect(skillQuestion.held).toEqual(["insight"]);
    expect(skillQuestion.selected).toEqual(["athletics"]);
  });

  it("never returns a question for a spell_choice class node", () => {
    const characterSave = save({
      classes: [{ classId: "class_wizard", level: 1, selections: {} }],
    });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(
      questions.some(
        (q) =>
          q.id === "wizard_level_1_cantrips" ||
          q.id === "wizard_level_1_spellbook",
      ),
    ).toBe(false);
  });

  it("gives every returned question a source", () => {
    const characterSave = save({ backgroundId: "background_acolyte" });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.source).toBeDefined();
      expect(question.source.id).toBeTruthy();
    }
  });
});

describe("choiceOptionLabel", () => {
  it("labels a trait id by its trait name", () => {
    expect(choiceOptionLabel("trait_fs_archery", snapshot)).toBe(
      "Fighting Style: Archery",
    );
  });

  it("labels a language id from LANGUAGE_DICTIONARY", () => {
    expect(choiceOptionLabel("elvish", snapshot)).toBe("Elvish");
  });

  it("labels a tool id from TOOL_DICTIONARY", () => {
    expect(choiceOptionLabel("thieves_tools", snapshot)).toBe(
      "Thieves' Tools",
    );
  });

  it("labels an ability key", () => {
    expect(choiceOptionLabel("STR", snapshot)).toBe("Strength");
  });

  it("humanises a skill id", () => {
    expect(choiceOptionLabel("sleight_of_hand", snapshot)).toBe(
      "Sleight of hand",
    );
  });

  it("humanises an unknown id the same way", () => {
    expect(choiceOptionLabel("trait_totally_made_up", snapshot)).toBe(
      "Totally made up",
    );
  });
});
