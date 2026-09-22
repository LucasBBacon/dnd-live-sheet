import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, LevelDecision } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { isStepComplete, levelUpSteps } from "../wizardValidation";

describe("isStepComplete: choices", () => {
  const question = (
    id: string,
    target: "class" | "trait",
    pickCount = 1,
  ): ChoiceQuestion => ({
    id,
    target,
    ...(target === "class" ? { classId: "class_fighter" } : {}),
    source: { kind: "class", id: "class_fighter", name: "Fighter" },
    prompt: `Choose for ${id}`,
    pickCount,
    options: [
      { id: "opt_a", label: "A" },
      { id: "opt_b", label: "B" },
    ],
    selected: [],
    held: [],
  });

  const classQuestion = question("fighter_level_1_fighting_style", "class");
  const traitQuestion = question("rogue_multiclass_skill", "trait");
  const questions = [classQuestion, traitQuestion];
  const ready = { questions, ready: true };

  it("is false when the trait question (answered through traitSelections) has no picks", () => {
    const payload: Partial<LevelUpPayload> = {
      selectedTraits: { fighter_level_1_fighting_style: ["opt_a"] },
    };

    expect(isStepComplete("choices", payload, [], ready)).toBe(false);
  });

  it("is false when the class question (answered through selectedTraits) has no picks", () => {
    const payload: Partial<LevelUpPayload> = {
      traitSelections: { rogue_multiclass_skill: ["opt_a"] },
    };

    expect(isStepComplete("choices", payload, [], ready)).toBe(false);
  });

  it("is true once every question has exactly pickCount picks in its own map", () => {
    const payload: Partial<LevelUpPayload> = {
      selectedTraits: { fighter_level_1_fighting_style: ["opt_a"] },
      traitSelections: { rogue_multiclass_skill: ["opt_b"] },
    };

    expect(isStepComplete("choices", payload, [], ready)).toBe(true);
  });

  it("is false when a question has more picks than its pickCount", () => {
    const payload: Partial<LevelUpPayload> = {
      selectedTraits: { fighter_level_1_fighting_style: ["opt_a", "opt_b"] },
      traitSelections: { rogue_multiclass_skill: ["opt_b"] },
    };

    expect(isStepComplete("choices", payload, [], ready)).toBe(false);
  });

  it("is true when there are no questions to answer", () => {
    expect(isStepComplete("choices", {}, [], { questions: [], ready: true })).toBe(true);
  });

  it("is false while the questions are still loading", () => {
    expect(isStepComplete("choices", {}, [], { questions: [], ready: false })).toBe(false);
  });

  it("is not a step for resolver trait_selection decisions any more", () => {
    expect(isStepComplete("trait_selection", {}, [])).toBe(false);
  });
});

describe("levelUpSteps", () => {
  const decision = (type: LevelDecision["type"], id = `dec_${type}`): LevelDecision => ({
    id,
    type,
    description: type,
    isRequired: true,
    quantity: 1,
  });

  it("always puts one choices step immediately before review", () => {
    expect(levelUpSteps([])).toEqual(["overview", "hp_increase", "choices", "review"]);
  });

  it("keeps subclass and ASI/feat steps, but no step for trait_selection decisions", () => {
    expect(
      levelUpSteps([
        decision("subclass"),
        decision("trait_selection", "a"),
        decision("trait_selection", "b"),
        decision("asi_or_feat"),
      ]),
    ).toEqual(["overview", "hp_increase", "subclass", "asi_or_feat", "choices", "review"]);
  });
});
