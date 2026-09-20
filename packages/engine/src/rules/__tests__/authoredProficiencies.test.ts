import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";
import { ProficiencyExtractor } from "../../pipeline/proficiencyExtractor.js";

const traits = corePackSnapshot().traitsById;

const pending = (traitId: string) =>
  ProficiencyExtractor.listPendingChoices([traits[traitId]!], {})[0]!;

describe("class skill grants offer the PHB's list", () => {
  it("offers a rogue four picks from eleven skills", () => {
    const choice = pending("trait_rogue_prof_skills");

    expect(choice.chooseAmount).toBe(4);
    expect(choice.availableOptions).toHaveLength(11);
    expect(choice.availableOptions).toContain("sleight_of_hand");
    expect(choice.availableOptions).not.toContain("arcana");
  });

  it("offers a ranger three picks from eight", () => {
    const choice = pending("trait_ranger_prof_skills");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(8);
  });

  it("offers a bard three picks from every skill there is", () => {
    const choice = pending("trait_bard_prof_skills");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(18);
  });

  it("offers one pick for each multiclass grant", () => {
    expect(pending("trait_bard_prof_mult_skills").chooseAmount).toBe(1);
    expect(pending("trait_rogue_mult_prof_skills").availableOptions).toHaveLength(11);
  });

  it("leaves no class skill grant carrying the schema's default of one", () => {
    const classSkillTraits = [
      "trait_cleric_prof_skills",
      "trait_druid_prof_skills",
      "trait_fighter_prof_skills",
      "trait_monk_prof_skills",
      "trait_paladin_prof_skills",
      "trait_sorcerer_prof_skills",
      "trait_warlock_prof_skills",
      "trait_wizard_prof_skills",
    ];

    for (const traitId of classSkillTraits) {
      expect(pending(traitId).chooseAmount).toBe(2);
    }
  });
});
