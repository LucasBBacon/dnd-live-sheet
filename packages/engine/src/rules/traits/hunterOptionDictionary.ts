import type { TraitDefinition } from "@project/shared";

/**
 * Ranger Hunter options: Hunter's Prey (3), Defensive Tactics (7),
 * Multiattack (11) and Superior Hunter's Defense (15).
 *
 * Mechanics are intentionally empty: these are the option lists behind
 * trait_choice nodes, and the descriptions are one-line summaries until the
 * full rules text and modifiers are filled in.
 */
export const HUNTER_OPTION_TRAITS: Record<string, TraitDefinition> = {
  trait_hunters_prey_colossus_slayer: {
    id: "trait_hunters_prey_colossus_slayer",
    name: "Colossus Slayer",
    description:
      "Deal an extra 1d8 damage once per turn to a creature below its hit point maximum.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_hunters_prey_giant_killer: {
    id: "trait_hunters_prey_giant_killer",
    name: "Giant Killer",
    description:
      "React to attack a Large or larger creature that hits or misses you within 5 feet.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_hunters_prey_horde_breaker: {
    id: "trait_hunters_prey_horde_breaker",
    name: "Horde Breaker",
    description:
      "Once per turn, attack a second creature adjacent to your first target.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_defensive_tactics_escape_the_horde: {
    id: "trait_defensive_tactics_escape_the_horde",
    name: "Escape the Horde",
    description: "Opportunity attacks against you are made with disadvantage.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_defensive_tactics_multiattack_defense: {
    id: "trait_defensive_tactics_multiattack_defense",
    name: "Multiattack Defense",
    description:
      "After a creature hits you, it takes -4 on its further attacks against you that turn.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_defensive_tactics_steel_will: {
    id: "trait_defensive_tactics_steel_will",
    name: "Steel Will",
    description:
      "You have advantage on saving throws against being frightened.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_multiattack_volley: {
    id: "trait_multiattack_volley",
    name: "Volley",
    description:
      "Make a ranged attack against any number of creatures within 10 feet of a point.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_multiattack_whirlwind_attack: {
    id: "trait_multiattack_whirlwind_attack",
    name: "Whirlwind Attack",
    description:
      "Make a melee attack against any number of creatures within 5 feet of you.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_superior_hunters_defense_evasion: {
    id: "trait_superior_hunters_defense_evasion",
    name: "Evasion",
    description:
      "Take no damage on a successful Dexterity save, and half on a failure.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_superior_hunters_defense_stand_against_the_tide: {
    id: "trait_superior_hunters_defense_stand_against_the_tide",
    name: "Stand Against the Tide",
    description:
      "Redirect a missed melee attack against another creature of your choice.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_superior_hunters_defense_uncanny_dodge: {
    id: "trait_superior_hunters_defense_uncanny_dodge",
    name: "Uncanny Dodge",
    description: "React to halve the damage of an attack you can see.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
