import { describe, expect, it } from "vitest";
import type { CharacterSave } from "@project/shared";
import { blockedOptionIds, choiceOptionLabel, listChoiceQuestions, type ChoiceQuestion } from "../choiceQuestions.js";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import type { RuleSnapshotLookup } from "../../rules/ruleLookup.js";
import { corePack, corePackLookup, corePackSnapshot } from "./corePackFixture.js";

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

/**
 * The pack with only its level-0 spells. Every pack spell is a placeholder
 * level 0 until #31a, so today this is the whole pack; built explicitly so
 * the tests that need "no spell of level 1 or above" keep meaning that.
 */
const cantripsOnly: RuleSnapshotLookup = {
  ...snapshot,
  spellsById: Object.fromEntries(
    Object.entries(snapshot.spellsById ?? {}).filter(
      ([, spell]) => spell.level === 0,
    ),
  ),
};

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

  it("asks a cleric's level-1 cantrips as a class question listing every level-0 spell", () => {
    const characterSave = save({
      classes: [{ classId: "class_cleric", level: 1, selections: {} }],
    });

    const cantrips = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "cleric_level_1_cantrips",
    )!;

    expect(cantrips.target).toBe("class");
    expect(cantrips.classId).toBe("class_cleric");
    expect(cantrips.source).toEqual({
      kind: "class",
      id: "class_cleric",
      name: "Cleric",
    });
    expect(cantrips.prompt).toBe("Cleric: choose 3 cantrip(s)");
    expect(cantrips.pickCount).toBe(3);
    expect(cantrips.options).toHaveLength(
      corePack().spells.filter((spell) => spell.level === 0).length,
    );
    expect(cantrips.options).toContainEqual({
      id: "spell_thaumaturgy",
      label: "Thaumaturgy",
    });
    expect(cantrips.selected).toEqual([]);
  });

  it("does not ask a spell node with nothing to offer", () => {
    const characterSave = save({
      classes: [{ classId: "class_wizard", level: 1, selections: {} }],
    });

    const ids = listChoiceQuestions(characterSave, cantripsOnly).map((q) => q.id);

    expect(ids).toContain("wizard_level_1_cantrips");
    expect(ids).not.toContain("wizard_level_1_spellbook");
  });

  it("keeps a class's trait and spell questions in the order its track authors them", () => {
    const characterSave = save({
      classes: [{ classId: "class_warlock", level: 3, selections: {} }],
    });

    const classIds = listChoiceQuestions(characterSave, cantripsOnly)
      .filter((q) => q.target === "class")
      .map((q) => q.id);

    expect(classIds).toEqual([
      "warlock_level_1_cantrips",
      "warlock_level_2_invocations",
      "warlock_level_3_pact_boon",
    ]);
  });

  it("asks a High Elf's cantrip as a trait question sourced from the subrace", () => {
    const characterSave = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
    });

    const cantrip = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "high_elf_cantrip",
    )!;

    expect(cantrip.target).toBe("trait");
    expect(cantrip.classId).toBeUndefined();
    expect(cantrip.source.kind).toBe("subrace");
    expect(cantrip.source.id).toBe("subrace_elf_high");
    expect(cantrip.prompt).toBe("(High Elf) Cantrip: choose 1 cantrip(s)");
    expect(cantrip.pickCount).toBe(1);
  });

  it("marks a spell a trait already grants as held, but not the question's own picks", () => {
    const characterSave = save({
      race: { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null },
      classes: [
        {
          classId: "class_cleric",
          level: 1,
          selections: { cleric_level_1_cantrips: ["spell_minor_illusion"] },
        },
      ],
    });

    const cantrips = listChoiceQuestions(characterSave, snapshot).find(
      (q) => q.id === "cleric_level_1_cantrips",
    )!;

    // Thaumaturgy comes with the tiefling's Infernal Legacy
    expect(cantrips.held).toContain("spell_thaumaturgy");
    expect(cantrips.held).not.toContain("spell_minor_illusion");
    expect(cantrips.selected).toEqual(["spell_minor_illusion"]);
  });

  it("marks another spell question's pick as held", () => {
    const characterSave = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: { wizard_level_1_cantrips: ["spell_dancing_lights"] },
        },
      ],
      traitSelections: { high_elf_cantrip: ["spell_minor_illusion"] },
    });

    const questions = listChoiceQuestions(characterSave, snapshot);

    expect(questions.find((q) => q.id === "high_elf_cantrip")!.held).toContain(
      "spell_dancing_lights",
    );
    expect(
      questions.find((q) => q.id === "wizard_level_1_cantrips")!.held,
    ).toContain("spell_minor_illusion");
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

  it("labels a spell id by its spell name", () => {
    expect(choiceOptionLabel("spell_thaumaturgy", snapshot)).toBe("Thaumaturgy");
  });
});

describe("listChoiceQuestions - option prerequisites", () => {
  /** a human Fiend warlock at the given level with these level-1 cantrips */
  const warlockSave = (
    level: number,
    cantrips: string[],
    picks: Record<string, string[]> = {},
  ) =>
    save({
      classes: [
        {
          classId: "class_warlock",
          level,
          subclassId: "subclass_warlock_fiend",
          selections: { warlock_level_1_cantrips: cantrips, ...picks },
        },
      ],
    });

  const optionOf = (
    questions: ChoiceQuestion[],
    questionId: string,
    optionId: string,
  ) =>
    questions
      .find((q) => q.id === questionId)!
      .options.find((o) => o.id === optionId)!;

  it("marks Agonizing Blast for a warlock who does not know Eldritch Blast", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_minor_illusion", "spell_dancing_lights"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_agonizing_blast")
        .unmet,
    ).toEqual(["needs Eldritch Blast"]);
  });

  it("leaves Agonizing Blast available once Eldritch Blast is known", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_eldritch_blast", "spell_minor_illusion"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_agonizing_blast"),
    ).not.toHaveProperty("unmet");
  });

  it("gives Thirsting Blade at warlock 2 both its reasons, level first", () => {
    const questions = listChoiceQuestions(
      warlockSave(2, ["spell_eldritch_blast", "spell_minor_illusion"]),
      snapshot,
    );

    expect(
      optionOf(questions, "warlock_level_2_invocations", "trait_invocation_thirsting_blade")
        .unmet,
    ).toEqual(["needs Warlock level 5", "needs Pact of the Blade"]);
  });

  it("marks a Four Elements monk's higher-level disciplines at monk 3", () => {
    const questions = listChoiceQuestions(
      save({
        classes: [
          {
            classId: "class_monk",
            level: 3,
            subclassId: "subclass_monk_four_elements",
            selections: {},
          },
        ],
      }),
      snapshot,
    );

    expect(
      optionOf(questions, "monk_elements_level_3_discipline", "trait_discipline_clench_of_the_north_wind")
        .unmet,
    ).toEqual(["needs Monk level 6"]);
    expect(
      optionOf(questions, "monk_elements_level_3_discipline", "trait_discipline_fangs_of_the_fire_snake"),
    ).not.toHaveProperty("unmet");
  });

  it("puts no unmet key on a trait choice block's options", () => {
    const questions = listChoiceQuestions(
      save({ backgroundId: "background_acolyte" }),
      snapshot,
    );

    for (const question of questions.filter((q) => q.target === "trait")) {
      for (const option of question.options) {
        expect(option).not.toHaveProperty("unmet");
      }
    }
  });

  // the picker and the validator share one prerequisite check
  // (optionPrerequisites.ts), and this pins that they agree not just by
  // construction but by test: every option the picker blocks is one
  // collectSaveIssues would also reject if picked, and nothing else is
  it("blocks exactly the invocation options collectSaveIssues also rejects when picked", () => {
    const cantrips = ["spell_eldritch_blast", "spell_minor_illusion"];
    const withPick = (optionId: string) =>
      warlockSave(3, cantrips, { warlock_level_2_invocations: [optionId] });

    const invocationsQuestion = listChoiceQuestions(
      warlockSave(3, cantrips),
      snapshot,
    ).find((q) => q.id === "warlock_level_2_invocations")!;

    const pickerBlocked = new Set(blockedOptionIds(invocationsQuestion));

    const validatorBlocked = new Set(
      invocationsQuestion.options
        .filter((option) =>
          CharacterBootstrapper.collectSaveIssues(
            withPick(option.id),
            corePackSnapshot(),
          ).some(
            (issue) =>
              issue.code === "unmet_prerequisite" &&
              issue.nodeId === "warlock_level_2_invocations",
          ),
        )
        .map((option) => option.id),
    );

    expect(pickerBlocked).toEqual(validatorBlocked);
  });
});

describe("blockedOptionIds", () => {
  it("returns held options and options with unmet prerequisites, once each", () => {
    const question: ChoiceQuestion = {
      id: "warlock_level_2_invocations",
      target: "class",
      classId: "class_warlock",
      source: { kind: "class", id: "class_warlock", name: "Warlock" },
      prompt: "Warlock: choose 2",
      pickCount: 2,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B", unmet: ["needs Eldritch Blast"] },
        { id: "c", label: "C", unmet: ["needs Warlock level 5"] },
      ],
      selected: [],
      held: ["c", "d"],
    };

    expect([...blockedOptionIds(question)].sort()).toEqual(["b", "c", "d"]);
  });

  it("does not block an option whose unmet array is empty", () => {
    const question: ChoiceQuestion = {
      id: "warlock_level_2_invocations",
      target: "class",
      classId: "class_warlock",
      source: { kind: "class", id: "class_warlock", name: "Warlock" },
      prompt: "Warlock: choose 2",
      pickCount: 2,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B", unmet: [] },
      ],
      selected: [],
      held: [],
    };

    expect(blockedOptionIds(question)).toEqual([]);
  });
});
