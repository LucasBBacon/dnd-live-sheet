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
      "trait_barbarian_prof_skills",
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

describe("backgrounds grant their PHB proficiencies", () => {
  const grantsOf = (traitId: string) =>
    ProficiencyExtractor.extractProficiencies([traits[traitId]!], {});

  const idsIn = (traitId: string, category: string) =>
    grantsOf(traitId)
      .filter((grant) => grant.category === category)
      .map((grant) => grant.proficiencyId)
      .sort();

  it("gives each background its two skills", () => {
    expect(idsIn("trait_acolyte_prof_skills", "skills")).toEqual(["insight", "religion"]);
    expect(idsIn("trait_criminal_prof_skills", "skills")).toEqual(["deception", "stealth"]);
    expect(idsIn("trait_noble_prof_skills", "skills")).toEqual(["history", "persuasion"]);
    expect(idsIn("trait_soldier_prof_skills", "skills")).toEqual(["athletics", "intimidation"]);
  });

  it("owes the acolyte two languages and the noble one", () => {
    expect(pending("trait_acolyte_languages").chooseAmount).toBe(2);
    expect(pending("trait_noble_languages").chooseAmount).toBe(1);
  });

  it("excludes the secret languages from an open pick", () => {
    const options = pending("trait_acolyte_languages").availableOptions;

    expect(options).toContain("dwarvish");
    expect(options).not.toContain("druidic");
    expect(options).not.toContain("thieves_cant");
  });

  it("gives the soldier land vehicles outright and a gaming set to choose", () => {
    expect(idsIn("trait_soldier_prof_tools", "tools")).toEqual(["vehicles_land"]);
    expect(pending("trait_soldier_prof_tools").availableOptions).toHaveLength(4);
  });
});

describe("class tool grants", () => {
  it("offers the bard three instruments from ten", () => {
    const choice = pending("trait_bard_prof_tools");

    expect(choice.chooseAmount).toBe(3);
    expect(choice.availableOptions).toHaveLength(10);
    expect(choice.availableOptions).toContain("lute");
  });

  it("offers the monk artisan's tools and instruments together", () => {
    const options = pending("trait_monk_prof_tools").availableOptions!;

    expect(options).toHaveLength(27);
    expect(options).toContain("smiths_tools");
    expect(options).toContain("flute");
    expect(options).not.toContain("thieves_tools");
  });

  it("gives the rogue thieves' tools outright", () => {
    const grants = ProficiencyExtractor.extractProficiencies(
      [traits["trait_rogue_prof_tools"]!],
      {},
    );

    expect(grants).toEqual([
      {
        category: "tools",
        proficiencyId: "thieves_tools",
        level: "proficient",
        requiredStates: [],
      },
    ]);
  });
});

describe("subclass bonus proficiencies", () => {
  const grantsOf = (traitId: string) =>
    ProficiencyExtractor.extractProficiencies([traits[traitId]!], {});

  it("gives the War Domain martial weapons and heavy armour", () => {
    expect(grantsOf("trait_cleric_war_prof_bonus").map((g) => g.proficiencyId).sort()).toEqual([
      "category_armor_heavy",
      "category_weapon_martial",
    ]);
  });

  it("gives the College of Valor medium armour, shields and martial weapons", () => {
    expect(
      grantsOf("trait_bard_valor_bonus_prof").map((g) => g.proficiencyId).sort(),
    ).toEqual([
      "category_armor_medium",
      "category_armor_shield",
      "category_weapon_martial",
    ]);
  });

  it("offers the Knowledge Domain two languages and two skills at expertise", () => {
    const choices = ProficiencyExtractor.listPendingChoices(
      [traits["trait_blessings_of_knowledge"]!],
      {},
    );

    const languages = choices.find((choice) => choice.category === "languages")!;
    const skills = choices.find((choice) => choice.category === "skills")!;

    expect(languages.chooseAmount).toBe(2);
    expect(skills.chooseAmount).toBe(2);
    expect(skills.level).toBe("expertise");
    expect(skills.availableOptions).toEqual([
      "arcana",
      "history",
      "nature",
      "religion",
    ]);
  });

  it("gives the Assassin both kits", () => {
    expect(
      grantsOf("trait_rogue_assassin_bonus_prof").map((g) => g.proficiencyId).sort(),
    ).toEqual(["disguise_kit", "poisoners_kit"]);
  });
});

describe("the proficiency family is closed", () => {
  it("leaves no proficiency-shaped trait unimplemented, other than the four pinned below", () => {
    const remaining = Object.values(traits)
      .filter((trait) => trait.implementation?.mode === "unimplemented")
      .filter((trait) =>
        /prof|languages|blessings_of_knowledge/.test(trait.id),
      )
      .map((trait) => trait.id)
      .sort();

    expect(remaining).toEqual([]);
  });

  it("pins the four traits still unimplemented for a schema reason, not an oversight", () => {
    // Each needs a ChoiceProficiencyGrant concept the schema does not have
    // yet (see the design doc's "Out of scope" section and backlog #66):
    // options drawn from proficiencies already held (trait_expertise), a
    // choice spanning two categories (trait_feat_skilled, the Skilled feat),
    // and blanket half-proficiency (trait_jack_of_all_trades,
    // trait_remarkable_athlete). None of their ids match
    // /prof|languages|blessings_of_knowledge/, so the negative assertion
    // above is blind to them regardless of whether they exist - this pins
    // them by id instead, so authoring one of them, or losing track of one,
    // fails here rather than nowhere.
    const outOfScopeIds = [
      "trait_expertise",
      "trait_feat_skilled",
      "trait_jack_of_all_trades",
      "trait_remarkable_athlete",
    ];

    for (const traitId of outOfScopeIds) {
      expect(traits[traitId]?.implementation?.mode).toBe("unimplemented");
    }
  });
});
