import type { TraitDefinition } from "@project/shared";

/**
 * Battle Master maneuvers, chosen at fighter 3, 7, 10 and 15.
 *
 * Mechanics are intentionally empty: these are the option lists behind
 * trait_choice nodes, and the descriptions are one-line summaries until the
 * full rules text and modifiers are filled in.
 */
export const MANEUVER_TRAITS: Record<string, TraitDefinition> = {
  trait_maneuver_commanders_strike: {
    id: "trait_maneuver_commanders_strike",
    name: "Commander's Strike",
    lore: {
      shortDescription:
        "Forgo an attack to let an ally strike, adding a superiority die to the damage.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_disarming_attack: {
    id: "trait_maneuver_disarming_attack",
    name: "Disarming Attack",
    lore: {
      shortDescription:
        "Force a target to drop an item on a failed Strength save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_distracting_strike: {
    id: "trait_maneuver_distracting_strike",
    name: "Distracting Strike",
    lore: {
      shortDescription: "Give the next attacker advantage against your target.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_evasive_footwork: {
    id: "trait_maneuver_evasive_footwork",
    name: "Evasive Footwork",
    lore: { shortDescription: "Add a superiority die to AC while you move." },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_feinting_attack: {
    id: "trait_maneuver_feinting_attack",
    name: "Feinting Attack",
    lore: {
      shortDescription:
        "Gain advantage against a creature within 5 feet, plus bonus damage.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_goading_attack: {
    id: "trait_maneuver_goading_attack",
    name: "Goading Attack",
    lore: {
      shortDescription:
        "The target has disadvantage attacking anyone but you on a failed Wisdom save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_lunging_attack: {
    id: "trait_maneuver_lunging_attack",
    name: "Lunging Attack",
    lore: {
      shortDescription: "Extend your melee reach by 5 feet for one attack.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_maneuvering_attack: {
    id: "trait_maneuver_maneuvering_attack",
    name: "Maneuvering Attack",
    lore: {
      shortDescription:
        "Let an ally move half their speed without provoking from your target.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_menacing_attack: {
    id: "trait_maneuver_menacing_attack",
    name: "Menacing Attack",
    lore: {
      shortDescription:
        "Frighten the target until the end of your next turn on a failed Wisdom save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_parry: {
    id: "trait_maneuver_parry",
    name: "Parry",
    lore: {
      shortDescription:
        "React to reduce melee damage by a superiority die plus your Dexterity modifier.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_precision_attack: {
    id: "trait_maneuver_precision_attack",
    name: "Precision Attack",
    lore: { shortDescription: "Add a superiority die to an attack roll." },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_pushing_attack: {
    id: "trait_maneuver_pushing_attack",
    name: "Pushing Attack",
    lore: {
      shortDescription:
        "Push a Large or smaller target 15 feet on a failed Strength save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_rally: {
    id: "trait_maneuver_rally",
    name: "Rally",
    lore: {
      shortDescription:
        "Grant an ally temporary hit points equal to a superiority die plus your Charisma modifier.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_riposte: {
    id: "trait_maneuver_riposte",
    name: "Riposte",
    lore: {
      shortDescription:
        "React to attack a creature that misses you with a melee attack.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_sweeping_attack: {
    id: "trait_maneuver_sweeping_attack",
    name: "Sweeping Attack",
    lore: {
      shortDescription:
        "Deal superiority die damage to a second creature within 5 feet of your target.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_maneuver_trip_attack: {
    id: "trait_maneuver_trip_attack",
    name: "Trip Attack",
    lore: {
      shortDescription:
        "Knock a Large or smaller target prone on a failed Strength save.",
    },
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
