import type { TraitDefinition } from "@project/shared";

/**
 * Sorcerer metamagic options, chosen at sorcerer 3, 10 and 17.
 *
 * Mechanics are intentionally empty: these are the option lists behind
 * trait_choice nodes, and the descriptions are one-line summaries until the
 * full rules text and modifiers are filled in.
 */
export const METAMAGIC_TRAITS: Record<string, TraitDefinition> = {
  trait_metamagic_careful_spell: {
    id: "trait_metamagic_careful_spell",
    name: "Careful Spell",
    lore: {
      shortDescription:
        "Spend 1 sorcery point to shield chosen creatures from your spell's effect on a successful save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_distant_spell: {
    id: "trait_metamagic_distant_spell",
    name: "Distant Spell",
    lore: {
      shortDescription:
        "Spend 1 sorcery point to double a spell's range, or to give a touch spell 30 feet of range.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_empowered_spell: {
    id: "trait_metamagic_empowered_spell",
    name: "Empowered Spell",
    lore: {
      shortDescription:
        "Spend 1 sorcery point to reroll damage dice up to your Charisma modifier.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_extended_spell: {
    id: "trait_metamagic_extended_spell",
    name: "Extended Spell",
    lore: {
      shortDescription:
        "Spend 1 sorcery point to double a spell's duration, up to 24 hours.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_heightened_spell: {
    id: "trait_metamagic_heightened_spell",
    name: "Heightened Spell",
    lore: {
      shortDescription:
        "Spend 3 sorcery points to give one target disadvantage on its first save against the spell.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_quickened_spell: {
    id: "trait_metamagic_quickened_spell",
    name: "Quickened Spell",
    lore: {
      shortDescription:
        "Spend 2 sorcery points to cast a 1-action spell as a bonus action.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_subtle_spell: {
    id: "trait_metamagic_subtle_spell",
    name: "Subtle Spell",
    lore: {
      shortDescription:
        "Spend 1 sorcery point to cast without verbal or somatic components.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_metamagic_twinned_spell: {
    id: "trait_metamagic_twinned_spell",
    name: "Twinned Spell",
    lore: {
      shortDescription:
        "Spend sorcery points equal to the spell's level to target a second creature.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
