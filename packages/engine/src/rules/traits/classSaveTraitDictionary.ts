import type { TraitDefinition } from "@project/shared";

const saveTrait = (
  id: string,
  name: string,
  desc: string,
  saves: [string, string],
): TraitDefinition => ({
  id,
  name,
  description: desc,
  modifiers: { fixed: [], choices: [] },
  proficiencies: {
    fixed: [
      { category: "saving_throws", proficiencyId: saves[0], level: "proficient", requiredStates: [] },
      { category: "saving_throws", proficiencyId: saves[1], level: "proficient", requiredStates: [] },
    ],
    choices: [],
  },
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

/** Saving throw proficiency entries for every base class. */
export const CLASS_SAVE_TRAITS: Record<string, TraitDefinition> = {
  trait_barbarian_prof_saving_throw: saveTrait(
    "trait_barbarian_prof_saving_throw",
    "Barbarian Saving Throw Proficiencies",
    "Proficiency in Strength and Constitution saving throws.",
    ["STR", "CON"],
  ),
  trait_bard_prof_saving_throw: saveTrait(
    "trait_bard_prof_saving_throw",
    "Bard Saving Throw Proficiencies",
    "Proficiency in Dexterity and Charisma saving throws.",
    ["DEX", "CHA"],
  ),
  trait_cleric_prof_saving_throw: saveTrait(
    "trait_cleric_prof_saving_throw",
    "Cleric Saving Throw Proficiencies",
    "Proficiency in Wisdom and Charisma saving throws.",
    ["WIS", "CHA"],
  ),
  trait_druid_prof_saving_throw: saveTrait(
    "trait_druid_prof_saving_throw",
    "Druid Saving Throw Proficiencies",
    "Proficiency in Intelligence and Wisdom saving throws.",
    ["INT", "WIS"],
  ),
  trait_fighter_prof_saving_throw: saveTrait(
    "trait_fighter_prof_saving_throw",
    "Fighter Saving Throw Proficiencies",
    "Proficiency in Strength and Constitution saving throws.",
    ["STR", "CON"],
  ),
  trait_monk_prof_saving_throw: saveTrait(
    "trait_monk_prof_saving_throw",
    "Monk Saving Throw Proficiencies",
    "Proficiency in Strength and Dexterity saving throws.",
    ["STR", "DEX"],
  ),
  trait_paladin_prof_saving_throw: saveTrait(
    "trait_paladin_prof_saving_throw",
    "Paladin Saving Throw Proficiencies",
    "Proficiency in Wisdom and Charisma saving throws.",
    ["WIS", "CHA"],
  ),
  trait_ranger_prof_saving_throw: saveTrait(
    "trait_ranger_prof_saving_throw",
    "Ranger Saving Throw Proficiencies",
    "Proficiency in Strength and Dexterity saving throws.",
    ["STR", "DEX"],
  ),
  trait_rogue_prof_saving_throw: saveTrait(
    "trait_rogue_prof_saving_throw",
    "Rogue Saving Throw Proficiencies",
    "Proficiency in Dexterity and Intelligence saving throws.",
    ["DEX", "INT"],
  ),
  trait_sorcerer_prof_saving_throw: saveTrait(
    "trait_sorcerer_prof_saving_throw",
    "Sorcerer Saving Throw Proficiencies",
    "Proficiency in Constitution and Charisma saving throws.",
    ["CON", "CHA"],
  ),
  trait_warlock_prof_saving_throw: saveTrait(
    "trait_warlock_prof_saving_throw",
    "Warlock Saving Throw Proficiencies",
    "Proficiency in Wisdom and Charisma saving throws.",
    ["WIS", "CHA"],
  ),
  trait_wizard_prof_saving_throw: saveTrait(
    "trait_wizard_prof_saving_throw",
    "Wizard Saving Throw Proficiencies",
    "Proficiency in Intelligence and Wisdom saving throws.",
    ["INT", "WIS"],
  ),
};
