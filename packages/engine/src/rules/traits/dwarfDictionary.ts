import type { TraitDefinition } from "@project/shared";

export const DWARF_TRAITS: Record<string, TraitDefinition> = {
  trait_dwarf_asi: {
    id: "trait_dwarf_asi",
    name: "(Dwarf) Ability Score Increase",
    modifiers: [
      {
        target: "CON",
        type: "add",
        value: 2,
        scalingFactor: "none",
      },
    ],
  },
  trait_dwarven_resilience: {
    id: "trait_dwarven_resilience",
    name: "Dwarven Resilience",
    modifiers: [
      {
        target: "POISON_SAVE",
        type: "advantage",
        value: 0,
        scalingFactor: "none",
      },
    ],
  },
  trait_dwarven_combat_training: {
    id: "trait_dwarven_combat_training",
    name: "Dwarven Combat Training",
    modifiers: [],
    proficiencies: {
      fixed: [
        {
          category: "weapons",
          proficiencyId: "item_weapon_battleaxe",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "item_weapon_handaxe",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "item_weapon_light_hammer",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "item_weapon_warhammer",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  trait_tool_proficiency: {
    id: "trait_tool_proficiency",
    name: "Tool Proficiency",
    modifiers: [],
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
  trait_stonecutting: {
    id: "trait_stonecutting",
    name: "Stonecutting",
    modifiers: [],
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
  trait_dwarf_languages: {
    id: "trait_dwarf_languages",
    name: "Languages",
    modifiers: [],
    proficiencies: {
      fixed: [
        {
          category: "languages",
          proficiencyId: "lang_common",
          level: "proficient",
        },
        {
          category: "languages",
          proficiencyId: "lang_dwarvish",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
};
