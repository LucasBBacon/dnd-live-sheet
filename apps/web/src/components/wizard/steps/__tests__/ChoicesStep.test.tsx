import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { LevelDecision } from "@project/engine";
import { ChoicesStep } from "../ChoicesStep";
import { useLevelUpStore } from "../../../../store/levelUpStore";
import { packRuleSnapshot } from "../../../../store/__tests__/packFixture";

const mocks = vi.hoisted(() => ({
  queryData: { current: null as { snapshot: unknown } | null },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.queryData.current,
    isLoading: mocks.queryData.current === null,
    isError: false,
  }),
}));

// packRuleSnapshot() reads the real shipped pack, exactly what the
// production endpoint this step queries would serve.
mocks.queryData.current = { snapshot: packRuleSnapshot() };

const classNodeDecision: LevelDecision = {
  id: "fighter_level_1_fighting_style",
  type: "trait_selection",
  description: "Choose a fighting style.",
  options: ["trait_fs_archery", "trait_fs_defense"],
  isRequired: true,
  quantity: 1,
};

const traitBlockDecision: LevelDecision = {
  id: "rogue_multiclass_skill",
  type: "trait_selection",
  description: "Choose a bonus skill.",
  options: ["skill_stealth", "skill_persuasion"],
  isRequired: true,
  quantity: 1,
  source: "trait_choice_block",
};

const renderStep = async (decisions: LevelDecision[]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ChoicesStep decisions={decisions} />);
  });

  return container;
};

const fieldsetCheckboxes = (container: HTMLElement, fieldsetIndex: number) => {
  const fieldset = container.querySelectorAll("fieldset")[fieldsetIndex];
  return Array.from(
    fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
};

describe("ChoicesStep", () => {
  beforeEach(() => {
    useLevelUpStore.setState({
      isActive: true,
      progressionContext: {
        classId: "class_fighter",
        level: 2,
        grantedTraits: [],
        decisions: [classNodeDecision, traitBlockDecision],
      },
      grantedTraitDetails: [],
      draftPayload: {
        characterId: "character-1",
        targetClassId: "class_fighter",
        newTotalLevel: 2,
        hpRoll: 6,
      },
      errorMessage: null,
    });
  });

  it("renders one picker per trait_selection decision, labelled from the rule snapshot", async () => {
    const container = await renderStep([classNodeDecision, traitBlockDecision]);

    expect(container.querySelectorAll("fieldset")).toHaveLength(2);
    // known-good label straight from choiceOptionLabel's own test suite
    expect(container.textContent).toContain("Fighting Style: Archery");
    // "skill_stealth" has no pack entry, so choiceOptionLabel humanises it
    expect(container.textContent).toContain("Stealth");
  });

  it("writes a class-progression pick to draftPayload.selectedTraits, preserving other draft keys", async () => {
    const container = await renderStep([classNodeDecision, traitBlockDecision]);

    await act(async () => {
      fieldsetCheckboxes(container, 0)[0]!.click();
    });

    const draft = useLevelUpStore.getState().draftPayload;

    expect(draft.selectedTraits).toEqual({
      fighter_level_1_fighting_style: ["trait_fs_archery"],
    });
    expect(draft.traitSelections).toBeUndefined();
    expect(draft.targetClassId).toBe("class_fighter");
    expect(draft.hpRoll).toBe(6);
  });

  it("writes a trait choice-block pick to draftPayload.traitSelections, preserving other draft keys", async () => {
    const container = await renderStep([classNodeDecision, traitBlockDecision]);

    await act(async () => {
      fieldsetCheckboxes(container, 1)[0]!.click();
    });

    const draft = useLevelUpStore.getState().draftPayload;

    expect(draft.traitSelections).toEqual({
      rogue_multiclass_skill: ["skill_stealth"],
    });
    expect(draft.targetClassId).toBe("class_fighter");
    expect(draft.hpRoll).toBe(6);
  });

  it("preserves an existing selectedTraits entry for another decision when writing a new one", async () => {
    useLevelUpStore.setState({
      draftPayload: {
        ...useLevelUpStore.getState().draftPayload,
        selectedTraits: { some_other_node: ["trait_x"] },
      },
    });

    const container = await renderStep([classNodeDecision, traitBlockDecision]);

    await act(async () => {
      fieldsetCheckboxes(container, 0)[0]!.click();
    });

    const draft = useLevelUpStore.getState().draftPayload;

    expect(draft.selectedTraits).toEqual({
      some_other_node: ["trait_x"],
      fighter_level_1_fighting_style: ["trait_fs_archery"],
    });
  });
});
