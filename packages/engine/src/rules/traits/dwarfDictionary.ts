import type { TraitDefinition } from "@project/shared";

export const DWARF_TRAITS: Record<string, TraitDefinition> = {
  race_dwarf_asi: {
    id: "race_dwarf_asi",
    name: "(Dwarf) Ability Score Increase",
    description: "Your Constitution score increases by 2.",
    modifiers: {
      fixed: [
        {
          target: "CON",
          type: "add",
          value: 2,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  race_dwarf_darkvision: {
    id: "race_dwarf_darkvision",
    name: "(Dwarf) Darkvision",
    description:
      "Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
    modifiers: {
      fixed: [
        {
          target: "SENSE_DARKVISION",
          type: "set_base",
          value: 60,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  dwarven_resilience: {
    id: "dwarven_resilience",
    name: "Dwarven Resilience",
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
  },
  dwarven_combat_training: {
    id: "dwarven_combat_training",
    name: "Dwarven Combat Training",
    description:
      "You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "weapons",
          proficiencyId: "weapon_battleaxe",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_handaxe",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_light_hammer",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_warhammer",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  tool_proficiency: {
    id: "tool_proficiency",
    name: "Tool Proficiency",
    description:
      "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [],
      choices: [
        {
          id: "dwarf_artisan_tools",
          category: "tools",
          chooseAmount: 1,
          options: ["smiths_tools", "brewers_supplies", "mason_tools"],
          level: "proficient",
        },
      ],
    },
  },
  stonecutting: {
    id: "stonecutting",
    name: "Stonecutting",
    description:
      "Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "ability_check",
          proficiencyId: "int_history",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  race_dwarf_languages: {
    id: "race_dwarf_languages",
    name: "(Dwarf) Languages",
    description:
      "You can speak, read, and write Common and Dwarvish. Dwarvish is full of hard consonants and guttural sounds, and those characteristics spill over into whatever other language a dwarf might speak.",
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
          proficiencyId: "dwarvish",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  subrace_dwarf_mountain_asi: {
    id: "subrace_dwarf_mountain_asi",
    name: "(Mountain Dwarf) Ability Score Increase",
    description: "Your Strength score increases by 2.",
    modifiers: {
      fixed: [
        {
          target: "STR",
          type: "add",
          value: 2,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  dwarven_armor_training: {
    id: "dwarven_armor_training",
    name: "Dwarven Armor Training",
    description: "You have proficiency with light and medium armor.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "armor",
          proficiencyId: "armor_light",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "armor_medium",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  subrace_dwarf_hill_asi: {
    id: "subrace_dwarf_hill_asi",
    name: "(Hill Dwarf) Ability Score Increase",
    description: "Your Wisdom score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "WIS",
          type: "add",
          value: 1,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  dwarven_toughness: {
    id: "dwarven_toughness",
    name: "Dwarven Toughness",
    description:
      "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.",
    modifiers: {
      fixed: [
        {
          target: "MAX_HP",
          type: "add",
          value: 1,
          scalingFactor: "total_level",
        },
      ],
      choices: [],
    },
  },
};
