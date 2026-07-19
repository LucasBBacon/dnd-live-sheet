import type { TraitDefinition } from "@project/shared";

export const HALF_ELF_TRAITS: Record<string, TraitDefinition> = {
  race_half_elf_asi: {
    id: "race_half_elf_asi",
    name: "(Half Elf) Ability Score Increase",
    description:
      "Your Charisma score increases by 2, and two other ability scores of your choice increase by 1.",
    modifiers: {
      fixed: [
        {
          target: "CHA",
          type: "add",
          value: 2,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [
        {
          id: "half_elf_asi_choice",
          chooseAmount: 2,
          options: ["STR", "DEX", "CON", "INT", "WIS"],
          modifierTemplate: {
            type: "add",
            value: 1,
            scalingFactor: "none",
          },
          allowDuplicates: false,
        },
      ],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  race_half_elf_darkvision: {
    id: "race_half_elf_darkvision",
    name: "(Half Elf) Darkvision",
    description:
      "Thanks to your elf blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
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
  // FEY ANCESTRY already defined in elfDictionary
  skill_versatility: {
    id: "skill_versatility",
    name: "Skill Versatility",
    description: "You gain proficiency in two skills of your choice.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [],
      choices: [
        {
          id: "skill_versatility_choice",
          category: "skills",
          chooseAmount: 2,
          level: "proficient",
          requiredStates: [],
        },
      ],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },

  race_half_elf_languages: {
    id: "race_half_elf_languages",
    name: "(Half Elf) Languages",
    description:
      "You can speak, read, and write Common, Elvish, and one extra language of your choice.",
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
          proficiencyId: "elvish",
          level: "proficient",
          requiredStates: [],
        },
      ],
      choices: [
        {
          id: "half_elf_language_choice",
          category: "languages",
          chooseAmount: 1,
          level: "proficient",
          options: [],
          requiredStates: [],
        },
      ],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
};
