import type { TraitDefinition } from "@project/shared";

export const DRAGONBORN_TRAITS: Record<string, TraitDefinition> = {
  race_dragonborn_asi: {
    id: "race_dragonborn_asi",
    name: "(Dragonborn) Ability Score Increase",
    description:
      "Your Strength score increases by 2, and your Charisma score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "STR",
          type: "add",
          value: 2,
          scalingFactor: "none",
        },
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
  subrace_dragonborn_black: {
    id: "subrace_dragonborn_black",
    name: "Black Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "acid",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_blue: {
    id: "subrace_dragonborn_blue",
    name: "Blue Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "lightning",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_brass: {
    id: "subrace_dragonborn_brass",
    name: "Brass Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_bronze: {
    id: "subrace_dragonborn_bronze",
    name: "Bronze Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "lightning",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_copper: {
    id: "subrace_dragonborn_copper",
    name: "Copper Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "acid",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_gold: {
    id: "subrace_dragonborn_gold",
    name: "Gold Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_green: {
    id: "subrace_dragonborn_green",
    name: "Green Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
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
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_red: {
    id: "subrace_dragonborn_red",
    name: "Red Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "fire",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_silver: {
    id: "subrace_dragonborn_silver",
    name: "Silver Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "cold",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  subrace_dragonborn_white: {
    id: "subrace_dragonborn_white",
    name: "White Dragon Ancestry",
    description: "You have draconic ancestry.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "cold",
          level: "resistance",
        },
      ],
      choices: [],
    },
    // TODO: Add actions for breath weapons
  },
  race_dragonborn_languages: {
    id: "race_dragonborn_languages",
    name: "(Dragonborn) Languages",
    description:
      "You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic. The language sounds harsh to most other creatures and includes numerous hard consonants and sibilants.",
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
          proficiencyId: "draconic",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
};
