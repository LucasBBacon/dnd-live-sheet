import type { TraitDefinition } from "@project/shared";

export const TIEFLING_TRAITS: Record<string, TraitDefinition> = {
  race_tiefling_asi: {
    id: "race_tiefling_asi",
    name: "(Tiefling) Ability Score Increase",
    description:
      "Your Intelligence score increases by 1, and your Charisma score increases by 2.",
    modifiers: {
      fixed: [
        {
          target: "INT",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "CHA",
          type: "add",
          value: 2,
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
  race_tiefling_darkvision: {
    id: "race_tiefling_darkvision",
    name: "(Tiefling) Darkvision",
    description:
      "Thanks to your infernal heritage, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
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
  hellish_resistance: {
    id: "hellish_resistance",
    name: "Hellish Resistance",
    description: "You have resistance to fire damage.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
          bypassedBy: [],
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
  infernal_legacy: {
    id: "infernal_legacy",
    name: "Infernal Legacy",
    description:
      "You know the thaumaturgy cantrip. When you reach 3rd level, you can cast the hellish rebuke spell as a 2nd-level spell once with this trait and regain the ability to do so when you finish a long rest. When you reach 5th level, you can cast the darkness spell once with this trait and regain the ability to do so when you finish a long rest. Charisma is your spellcasting ability for these spells.",
    modifiers: { fixed: [], choices: [] },
    // TODO: Improve lexical record to allow for target and resolution roll standards
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  race_tiefling_languages: {
    id: "race_tiefling_languages",
    name: "(Tiefling) Languages",
    description: "You can speak, read, and write Common and Infernal.",
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
          proficiencyId: "infernal",
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
