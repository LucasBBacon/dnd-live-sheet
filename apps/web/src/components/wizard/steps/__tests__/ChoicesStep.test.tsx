import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { CharacterSave } from "@project/shared";
import { listChoiceQuestions, type ChoiceQuestion } from "@project/engine";
import { ChoicesStep } from "../ChoicesStep";
import { useLevelUpStore } from "../../../../store/levelUpStore";
import { packRuleSnapshot } from "../../../../store/__tests__/packFixture";

/**
 * The questions the server sends for a level-3 human fighter dipping into
 * bard: its questions after the dip minus those it had before - the same
 * subtraction the options endpoint makes, over the real shipped pack. The
 * bard's roster skill block arrives with its whole roster and the fighter's
 * own skills marked held.
 */
const bardDipQuestions = (): ChoiceQuestion[] => {
  const fighter: CharacterSave = {
    attributes: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 13 },
    race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
    classes: [
      {
        classId: "class_fighter",
        level: 3,
        subclassId: "subclass_fighter_champion",
        selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
    ],
    traitSelections: {
      human_language_choice: ["elvish"],
      fighter_starting_skills: ["athletics", "perception"],
    },
    feats: [],
    hp: { current: 30, temporary: 0, baseRolledHp: 30, hitDiceSpent: {} },
  };
  const dipped: CharacterSave = {
    ...fighter,
    classes: [...fighter.classes, { classId: "class_bard", level: 1, selections: {} }],
  };
  const snapshot = packRuleSnapshot();
  const before = new Set(listChoiceQuestions(fighter, snapshot).map((q) => q.id));
  return listChoiceQuestions(dipped, snapshot).filter((q) => !before.has(q.id));
};

const classQuestion: ChoiceQuestion = {
  id: "fighter_champion_level_10_fighting_style",
  target: "class",
  classId: "class_fighter",
  source: { kind: "class", id: "class_fighter", name: "Fighter" },
  prompt: "Fighter: choose 1 (Fighter champion level 10 fighting style)",
  pickCount: 1,
  options: [
    { id: "trait_fs_archery", label: "Fighting Style: Archery" },
    { id: "trait_fs_dueling", label: "Fighting Style: Dueling" },
  ],
  selected: [],
  held: [],
};

const traitQuestion: ChoiceQuestion = {
  id: "rogue_multiclass_skill",
  target: "trait",
  source: { kind: "class", id: "class_rogue", name: "Rogue" },
  prompt: "Rogue multiclass skill: choose 1 skills",
  pickCount: 1,
  options: [
    { id: "stealth", label: "Stealth" },
    { id: "athletics", label: "Athletics" },
  ],
  selected: [],
  held: ["athletics"],
};

const renderStep = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ChoicesStep />);
  });

  return container;
};

const fieldsetCheckboxes = (container: HTMLElement, fieldsetIndex: number) => {
  const fieldset = container.querySelectorAll("fieldset")[fieldsetIndex];
  return Array.from(
    fieldset!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
};

const withQuestions = (choiceQuestions: ChoiceQuestion[]) =>
  useLevelUpStore.setState({ choiceQuestions, questionsStatus: "ready" });

describe("ChoicesStep", () => {
  beforeEach(() => {
    useLevelUpStore.setState({
      isActive: true,
      progressionContext: {
        classId: "class_fighter",
        level: 10,
        grantedTraits: [],
        decisions: [],
      },
      grantedTraitDetails: [],
      draftPayload: {
        characterId: "character-1",
        targetClassId: "class_fighter",
        newTotalLevel: 10,
        hpRoll: 6,
      },
      errorMessage: null,
      choiceQuestions: [],
      questionsStatus: "ready",
    });
  });

  it("renders the server's questions as they come, grouped under their source", async () => {
    withQuestions([classQuestion, traitQuestion]);
    const container = await renderStep();

    expect(container.querySelectorAll("fieldset")).toHaveLength(2);
    expect(container.textContent).toContain("Fighting Style: Dueling");
    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(expect.arrayContaining(["Fighter", "Rogue"]));
  });

  it("marks a held option already known and disables it", async () => {
    withQuestions([traitQuestion]);
    const container = await renderStep();

    const [stealth, athletics] = fieldsetCheckboxes(container, 0);
    expect(stealth!.disabled).toBe(false);
    expect(athletics!.disabled).toBe(true);
    expect(container.textContent).toContain("Athletics (already known)");
  });

  it("offers a bard dip's roster skill pick its whole roster, the fighter's skills held", async () => {
    withQuestions(bardDipQuestions());
    const container = await renderStep();

    const fieldset = Array.from(container.querySelectorAll("fieldset")).find(
      (candidate) => candidate.textContent?.includes("Stealth"),
    );
    expect(fieldset).toBeDefined();
    const boxes = fieldset!.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBeGreaterThanOrEqual(18);
    expect(fieldset!.textContent).toContain("Athletics (already known)");
  });

  it("says there is nothing to choose when the level asks nothing", async () => {
    const container = await renderStep();

    expect(container.querySelectorAll("fieldset")).toHaveLength(0);
    expect(container.textContent).toContain("Nothing to choose");
  });

  it("says the questions are loading until they arrive", async () => {
    useLevelUpStore.setState({ questionsStatus: "loading" });
    const container = await renderStep();

    expect(container.textContent).toContain("Loading");
    expect(container.textContent).not.toContain("Nothing to choose");
  });

  it("writes a class question's pick to draftPayload.selectedTraits, preserving other draft keys", async () => {
    withQuestions([classQuestion, traitQuestion]);
    const container = await renderStep();

    await act(async () => {
      fieldsetCheckboxes(container, 0)[0]!.click();
    });

    const draft = useLevelUpStore.getState().draftPayload;
    expect(draft.selectedTraits).toEqual({
      fighter_champion_level_10_fighting_style: ["trait_fs_archery"],
    });
    expect(draft.traitSelections).toBeUndefined();
    expect(draft.hpRoll).toBe(6);
  });

  it("writes a trait question's pick to draftPayload.traitSelections, preserving other entries", async () => {
    withQuestions([classQuestion, traitQuestion]);
    useLevelUpStore.setState({
      draftPayload: {
        ...useLevelUpStore.getState().draftPayload,
        traitSelections: { some_other_block: ["x"] },
      },
    });
    const container = await renderStep();

    await act(async () => {
      fieldsetCheckboxes(container, 1)[0]!.click();
    });

    const draft = useLevelUpStore.getState().draftPayload;
    expect(draft.traitSelections).toEqual({
      some_other_block: ["x"],
      rogue_multiclass_skill: ["stealth"],
    });
    expect(draft.targetClassId).toBe("class_fighter");
  });
});
