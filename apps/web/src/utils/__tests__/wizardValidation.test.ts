import { describe, expect, it } from "vitest";
import type { LevelDecision } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { isStepComplete } from "../wizardValidation";

describe("isStepComplete: trait_selection", () => {
  const traitBlockDecision: LevelDecision = {
    id: "rogue_multiclass_skill",
    type: "trait_selection",
    description: "Choose a bonus skill.",
    options: ["skill_stealth", "skill_deception"],
    isRequired: true,
    quantity: 1,
    source: "trait_choice_block",
  };

  const classNodeDecision: LevelDecision = {
    id: "fighter_level_1_fighting_style",
    type: "trait_selection",
    description: "Choose a fighting style.",
    options: ["trait_fs_archery", "trait_fs_defense"],
    isRequired: true,
    quantity: 1,
  };

  const decisions = [traitBlockDecision, classNodeDecision];

  it("is false when the trait-block decision (answered through traitSelections) has no picks", () => {
    const payload: Partial<LevelUpPayload> = {
      selectedTraits: { fighter_level_1_fighting_style: ["trait_fs_archery"] },
    };

    expect(isStepComplete("trait_selection", payload, decisions)).toBe(false);
  });

  it("is false when the class-node decision (answered through selectedTraits) has no picks", () => {
    const payload: Partial<LevelUpPayload> = {
      traitSelections: { rogue_multiclass_skill: ["skill_stealth"] },
    };

    expect(isStepComplete("trait_selection", payload, decisions)).toBe(false);
  });

  it("is true once every decision has exactly quantity picks in its own map", () => {
    const payload: Partial<LevelUpPayload> = {
      traitSelections: { rogue_multiclass_skill: ["skill_stealth"] },
      selectedTraits: { fighter_level_1_fighting_style: ["trait_fs_archery"] },
    };

    expect(isStepComplete("trait_selection", payload, decisions)).toBe(true);
  });

  it("is false when a decision has more picks than its quantity allows", () => {
    const payload: Partial<LevelUpPayload> = {
      traitSelections: {
        rogue_multiclass_skill: ["skill_stealth", "skill_deception"],
      },
      selectedTraits: { fighter_level_1_fighting_style: ["trait_fs_archery"] },
    };

    expect(isStepComplete("trait_selection", payload, decisions)).toBe(false);
  });

  it("defaults a missing quantity to 1 pick required", () => {
    const decisionWithoutQuantity: LevelDecision = {
      id: "node_no_quantity",
      type: "trait_selection",
      description: "Choose one.",
      options: ["trait_a", "trait_b"],
      isRequired: true,
    };

    expect(
      isStepComplete(
        "trait_selection",
        { selectedTraits: { node_no_quantity: ["trait_a"] } },
        [decisionWithoutQuantity],
      ),
    ).toBe(true);

    expect(
      isStepComplete("trait_selection", { selectedTraits: {} }, [
        decisionWithoutQuantity,
      ]),
    ).toBe(false);
  });

  it("is true when there are no trait_selection decisions to answer", () => {
    expect(isStepComplete("trait_selection", {}, [])).toBe(true);
  });
});

describe("isStepComplete: spell_selection", () => {
  it("is always false - the wizard cannot complete a spell-choice step yet (#79)", () => {
    const decisions: LevelDecision[] = [
      {
        id: "node_spell_pick",
        type: "spell_selection",
        description: "Choose a spell.",
        isRequired: true,
        quantity: 2,
      },
    ];

    expect(isStepComplete("spell_selection", {}, decisions)).toBe(false);
    expect(
      isStepComplete(
        "spell_selection",
        { addedSpells: ["spell_fire_bolt", "spell_ray_of_frost"] },
        decisions,
      ),
    ).toBe(false);
  });
});
