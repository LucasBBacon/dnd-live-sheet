import type { TraitDefinition } from "@project/shared";

/**
 * Path of the Totem Warrior options. The totem is chosen independently at
 * levels 3, 6 and 14, so a barbarian can mix bear, eagle and wolf.
 *
 * Mechanics are intentionally empty: these are the option lists behind
 * trait_choice nodes, and the descriptions are one-line summaries until the
 * full rules text and modifiers are filled in.
 */
export const TOTEM_TRAITS: Record<string, TraitDefinition> = {
  trait_totem_spirit_bear: {
    id: "trait_totem_spirit_bear",
    name: "Totem Spirit: Bear",
    description:
      "While raging you have resistance to all damage except psychic.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_totem_spirit_eagle: {
    id: "trait_totem_spirit_eagle",
    name: "Totem Spirit: Eagle",
    description:
      "While raging and unarmored, opportunity attacks against you have disadvantage and you can Dash as a bonus action.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_totem_spirit_wolf: {
    id: "trait_totem_spirit_wolf",
    name: "Totem Spirit: Wolf",
    description:
      "While raging, your allies have advantage on melee attacks against enemies within 5 feet of you.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_aspect_of_the_beast_bear: {
    id: "trait_aspect_of_the_beast_bear",
    name: "Aspect of the Beast: Bear",
    description:
      "Your carrying capacity doubles and you have advantage on Strength checks to move objects.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_aspect_of_the_beast_eagle: {
    id: "trait_aspect_of_the_beast_eagle",
    name: "Aspect of the Beast: Eagle",
    description:
      "You can see up to a mile away with ease and dim light does not impose disadvantage on Perception.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_aspect_of_the_beast_wolf: {
    id: "trait_aspect_of_the_beast_wolf",
    name: "Aspect of the Beast: Wolf",
    description:
      "You can track at a fast pace and move stealthily at a normal pace.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_totemic_attunement_bear: {
    id: "trait_totemic_attunement_bear",
    name: "Totemic Attunement: Bear",
    description:
      "While raging, enemies within 5 feet have disadvantage attacking anyone but you.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_totemic_attunement_eagle: {
    id: "trait_totemic_attunement_eagle",
    name: "Totemic Attunement: Eagle",
    description:
      "While raging, you gain a flying speed equal to your walking speed for one turn.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_totemic_attunement_wolf: {
    id: "trait_totemic_attunement_wolf",
    name: "Totemic Attunement: Wolf",
    description:
      "While raging, you can knock a Large or smaller creature prone when you hit it.",
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
