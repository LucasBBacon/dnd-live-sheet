import type { TraitDefinition } from "@project/shared";

export const HALFLING_TRAITS: Record<string, TraitDefinition> = {
  race_halfling_asi: {
    id: "race_halfling_asi",
    name: "(Halfling) Ability Score Increase",
    description: "Your Dexterity score increases by 2.",
    modifiers: {
      fixed: [
        {
          target: "DEX",
          type: "add",
          value: 2,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  lucky: {
    id: "lucky",
    name: "Lucky",
    description:
      "When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    // TODO: Conditional measures
  },
  brave: {
    id: "brave",
    name: "Brave",
    description:
      "You have advantage on saving throws against being frightened.",
    modifiers: {
      fixed: [
        {
          target: "FRIGHTEN_SAVE",
          type: "advantage",
          value: 0,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  halfling_nimbleness: {
    id: "halfling_nimbleness",
    name: "Halfling Nimbleness",
    description:
      "You can move through the space of any creature that is of a size larger than yours.",
    modifiers: {
      fixed: [],
      choices: [],
    },
  },
  race_halfling_languages: {
    id: "race_halfling_languages",
    name: "(Halfling) Languages",
    description:
      "You can speak, read, and write Common and Halfling. The Halfling language isn't secret, but halflings are loath to share it with others. They write very little, so they don't have a rich body of literature. Their oral tradition, however, is very strong. Almost all halflings speak Common to converse with the people in whose lands they dwell or through which they are traveling.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "languages",
          proficiencyId: "common",
          level: "proficient",
        },
        {
          category: "languages",
          proficiencyId: "halfling",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  subrace_halfling_lightfoot_asi: {
    id: "subrace_halfling_lightfoot_asi",
    name: "(Lightfoot Halfling) Ability Score Increase",
    description: "Your Charisma score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "CHA",
          type: "add",
          value: 1,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  naturally_stealthy: {
    id: "naturally_stealthy",
    name: "Naturally Stealthy",
    description:
      "You can attempt to hide even when you are obscured only by a creature tha tis at least one size larger than you.",
    modifiers: {
      fixed: [],
      choices: [],
    },
  },
  subrace_halfling_stout_asi: {
    id: "subrace_halfling_stout_asi",
    name: "(Stout Halfling) Ability Score Increase",
    description: "Your Constitution score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "CON",
          type: "add",
          value: 1,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  stout_resilience: {
    id: "stout_resilience",
    name: "Stout Resilience",
    description:
      "You have advantage on saving throws against poison, and you have resistance against poison damage.",
    modifiers: {
      fixed: [
        {
          target: "POISON_SAVE",
          type: "advantage",
          value: 0,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "poison",
          level: "resistance",
        },
      ],
      choices: [],
    },
  },
};
