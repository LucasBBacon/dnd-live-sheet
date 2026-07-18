import type { TraitDefinition } from "@project/shared";

export const ELF_TRAITS: Record<string, TraitDefinition> = {
  race_elf_asi: {
    id: "race_elf_asi",
    name: "(Elf) Ability Score Increase",
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
  race_elf_darkvision: {
    id: "race_elf_darkvision",
    name: "(Elf) Darkvision",
    description:
      "Accustomed to twilit forests and the night sky, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
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
  keen_senses: {
    id: "keen_senses",
    name: "Keen Senses",
    description: "You have proficiency in the Perception skill.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "skills",
          proficiencyId: "skill_perception",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  fey_ancestry: {
    id: "fey_ancestry",
    name: "Fey Ancestry",
    description:
      "You have advantage on saving throws against being charmed, and magic can't put you to sleep.",
    modifiers: {
      fixed: [
        {
          target: "CHARM_SAVE",
          type: "advantage",
          value: 0,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  trance: {
    id: "trance",
    name: "Trance",
    description:
      "Elves don't need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day. (The Common word for such meditation is “trance.”) While meditating, you can dream after a fashion; such dreams are actually mental exercises that have become reflexive through years of practice. After resting in this way, you gain the same benefit that a human does from 8 hours of sleep.",
    modifiers: { fixed: [], choices: [] },
  },
  race_elf_languages: {
    id: "elf_languages",
    name: "(Elf) Languages",
    description:
      "You can speak, read, and write Common and Elvish. Elvish is fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied, and their songs and poems are famous among other races. Many bards learn their language so they can add Elvish ballads to their repertoires.",
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
          proficiencyId: "elvish",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  subrace_elf_high_asi: {
    id: "subrace_elf_high_asi",
    name: "(High Elf) Ability Score Increase",
    description: "Your Intelligence score increases by 1.",
    modifiers: {
      fixed: [
        {
          target: "INT",
          type: "add",
          value: 1,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  elf_weapon_training: {
    id: "elf_weapon_training",
    name: "Elf Weapon Training",
    description:
      "You have proficiency with the longsword, shortsword, shortbow, and longbow.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "weapons",
          proficiencyId: "weapon_longsword",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_shortsword",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_shortbow",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_longbow",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
  subrace_elf_high_cantrip: {
    id: "subrace_elf_high_cantrip",
    name: "(High Elf) Cantrip",
    description:
      "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.",
    modifiers: {
      fixed: [],
      choices: [],
      // TODO: Add cantrip / spells mechanics!!!!
    },
  },
  subrace_elf_high_extra_language: {
    id: "subrace_elf_high_extra_language",
    name: "(Elf High) Extra Language",
    description:
      "You can speak, read, and write one extra language of your choice.",
    modifiers: {
      fixed: [],
      choices: [],
    },
    proficiencies: {
      fixed: [],
      choices: [
        {
          id: "elf_high_choice_extra_lang",
          category: "languages",
          chooseAmount: 1,
          level: "proficient",
        },
      ],
    },
  },
  subrace_elf_wood_asi: {
    id: "subrace_elf_wood_asi",
    name: "(Wood Elf) Ability Score Increase",
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
  fleet_of_foot: {
    id: "fleet_of_foot",
    name: "Fleet of Foot",
    description: "Your base walking speed increases to 35 feet.",
    modifiers: {
      fixed: [
        {
          target: "SPEED",
          type: "set_base",
          value: 35,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  mask_of_the_wild: {
    id: "mask_of_the_wild",
    name: "Mask of the Wild",
    description:
      "You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena.",
    modifiers: { fixed: [], choices: [] },
  },
  subrace_elf_dark_asi: {
    id: "subrace_elf_dark_asi",
    name: "(Dark Elf) Ability Score Increase",
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
  subrace_elf_dark_superior_darkvision: {
    id: "subrace_elf_dark_superior_darkvision",
    name: "(Dark Elf) Darkvision",
    description: "Your darkvision has a radius of 120 feet.",
    modifiers: {
      fixed: [
        {
          target: "SENSE_DARKVISION",
          type: "set_base",
          value: 120,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  sunlight_sensitivity: {
    id: "sunlight_sensitivity",
    name: "Sunlight Sensitivity",
    description:
      "You have disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight when you, the target of your attack, or whatever you are trying to perceive is in direct sunlight.",
    modifiers: { fixed: [], choices: [] },
  },
  drow_magic: {
    id: "drow_magic",
    name: "Drow Magic",
    description:
      "You know the dancing lights cantrip. When you reach 3rd level, you can cast the faerie fire spell once per day. When you reach 5th level, you can also cast the darkness spell once per day. Charisma is your spellcasting ability for these spells.",
    modifiers: {
      fixed: [],
      choices: [],
      // TODO: Add cantrip / spells mechanics!!!!
    },
  },
  drow_weapon_training: {
    id: "drow_weapon_training",
    name: "Drow Weapon Training",
    description:
      "You have proficiency with rapiers, shortswords, and hand crossbows.",
    modifiers: { fixed: [], choices: [] },
    proficiencies: {
      fixed: [
        {
          category: "weapons",
          proficiencyId: "weapon_rapier",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_shortsword",
          level: "proficient",
        },
        {
          category: "weapons",
          proficiencyId: "weapon_crossbow_hand",
          level: "proficient",
        },
      ],
      choices: [],
    },
  },
};
