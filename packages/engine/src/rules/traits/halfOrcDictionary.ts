import type { TraitDefinition } from "@project/shared";

export const HALF_ORC_TRAITS: Record<string, TraitDefinition> = {
  race_half_orc_asi: {
    id: "race_half_orc_asi",
    name: "(Half Orc) Ability Score Increase",
    description:
      "Your Strength score increases by 2, and your Constitution score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "STR",
          type: "add",
          value: 2,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "CON",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },

    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  race_half_orc_darkvision: {
    id: "race_half_orc_darkvision",
    name: "(Half Orc) Darkvision",
    description:
      "Thanks to your orc blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
    modifiers: {
      fixed: [
        {
          target: "SENSE_DARKVISION",
          type: "set_base",
          value: 60,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  menacing: {
    id: "menacing",
    name: "Menacing",
    description: "You gain proficiency in the Intimidation skill.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "skills",
          proficiencyId: "skill_intimidation",
          level: "proficient",
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  relentless_endurance: {
    id: "relentless_endurance",
    name: "Relentless Endurance",
    description:
      "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can't use this feature again until you finish a long rest.",
    // TODO: Conditional events
    modifiers: { fixed: [], choices: [] },
    resources: [
      {
        id: "resource_relentless_endurance",
        name: "Relentless Endurance Use",
        maxCharges: 1,
        resetOn: "long_rest",
      },
    ],
    // instructs the engine to listen for an even and fire a macro
    triggers: [
      {
        listenFor: "ON_HP_REDUCED_TO_ZERO",
        executeAction: "MACRO_DROP_TO_ONE_HP",
        consumeResource: "resource_relentless_endurance",
      },
    ],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  savage_attacks: {
    id: "savage_attacks",
    name: "Savage Attacks",
    description:
      "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage on the critical hit.",
    // TODO: Conditional events
    modifiers: { fixed: [], choices: [] },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [
      {
        type: "add_base_die",
        requiredAttackTypes: ["melee_weapon"],
      },
    ],
    actions: [],
  },
  race_half_orc_languages: {
    id: "race_half_orc_languages",
    name: "(Half Orc) Languages",
    description:
      "You can speak. read, and write Common and Orc. Orc is a harsh. grating language with hard consonants. It has no script of its own but is written in the Dwarvish script.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "languages",
          proficiencyId: "common",
          level: "proficient",
          requiredStates: [],
        },
        {
          category: "languages",
          proficiencyId: "orc",
          level: "proficient",
          requiredStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
