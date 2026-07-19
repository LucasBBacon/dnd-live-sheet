import type { TraitDefinition } from "@project/shared";

export const HUMAN_TRAITS: Record<string, TraitDefinition> = {
  race_human_asi: {
    id: "race_human_asi",
    name: "(Human) Ability Score Increase",
    description: "Your ability scores each increase by 1.",
    modifiers: {
      fixed: [
        {
          target: "STR",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "DEX",
          type: "add",
          value: 1,
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
        {
          target: "INT",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "WIS",
          type: "add",
          value: 1,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "CHA",
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
  race_half_elf_languages: {
    id: "race_half_elf_languages",
    name: "(Half Elf) Languages",
    description:
      "You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "languages",
          proficiencyId: "common",
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
          options: [""], // TODO: add lang options!!
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
