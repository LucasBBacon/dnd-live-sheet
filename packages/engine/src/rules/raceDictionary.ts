/**
 * Canonical race blueprints.
 *
 * Every trait id below already exists in TRAIT_DICTIONARY, with one exception
 * flagged inline on the human entry.
 *
 * `RaceDefinition` widens the stub that lived in characterBootstraper.ts:
 * subraces are needed to satisfy RaceConfigurationSchema (hasSubraces /
 * subraceId), and size + speed have no trait representation, so they are stored
 * as flat race data.
 */
export interface SubraceDefinition {
  id: string;
  name: string;
  grantedTraitIds: string[];
}

export interface RaceDefinition {
  id: string;
  name: string;
  size: "small" | "medium";
  // base walking speed in feet, before traits such as fleet_of_foot override it
  speed: number;
  grantedTraitIds: string[];
  hasSubraces: boolean;
  subraces: Record<string, SubraceDefinition>;
}

export const RACE_DICTIONARY: Record<string, RaceDefinition> = {
  race_dragonborn: {
    id: "race_dragonborn",
    name: "Dragonborn",
    size: "medium",
    speed: 30,
    grantedTraitIds: ["race_dragonborn_asi", "race_dragonborn_languages"],
    // draconic ancestry is modelled as the subrace: each option is a single
    // trait carrying both the damage resistance and the breath weapon
    hasSubraces: true,
    subraces: {
      subrace_dragonborn_black: {
        id: "subrace_dragonborn_black",
        name: "Black Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_black"],
      },
      subrace_dragonborn_blue: {
        id: "subrace_dragonborn_blue",
        name: "Blue Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_blue"],
      },
      subrace_dragonborn_brass: {
        id: "subrace_dragonborn_brass",
        name: "Brass Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_brass"],
      },
      subrace_dragonborn_bronze: {
        id: "subrace_dragonborn_bronze",
        name: "Bronze Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_bronze"],
      },
      subrace_dragonborn_copper: {
        id: "subrace_dragonborn_copper",
        name: "Copper Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_copper"],
      },
      subrace_dragonborn_gold: {
        id: "subrace_dragonborn_gold",
        name: "Gold Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_gold"],
      },
      subrace_dragonborn_green: {
        id: "subrace_dragonborn_green",
        name: "Green Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_green"],
      },
      subrace_dragonborn_red: {
        id: "subrace_dragonborn_red",
        name: "Red Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_red"],
      },
      subrace_dragonborn_silver: {
        id: "subrace_dragonborn_silver",
        name: "Silver Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_silver"],
      },
      subrace_dragonborn_white: {
        id: "subrace_dragonborn_white",
        name: "White Dragon Ancestry",
        grantedTraitIds: ["subrace_dragonborn_white"],
      },
    },
  },

  race_dwarf: {
    id: "race_dwarf",
    name: "Dwarf",
    size: "medium",
    speed: 25,
    grantedTraitIds: [
      "race_dwarf_asi",
      "race_dwarf_darkvision",
      "dwarven_resilience",
      "dwarven_combat_training",
      "tool_proficiency",
      "stonecutting",
      "race_dwarf_languages",
    ],
    hasSubraces: true,
    subraces: {
      subrace_dwarf_mountain: {
        id: "subrace_dwarf_mountain",
        name: "Mountain Dwarf",
        grantedTraitIds: [
          "subrace_dwarf_mountain_asi",
          "dwarven_armor_training",
        ],
      },
      subrace_dwarf_hill: {
        id: "subrace_dwarf_hill",
        name: "Hill Dwarf",
        grantedTraitIds: ["subrace_dwarf_hill_asi", "dwarven_toughness"],
      },
    },
  },

  race_elf: {
    id: "race_elf",
    name: "Elf",
    size: "medium",
    speed: 30,
    grantedTraitIds: [
      "race_elf_asi",
      "race_elf_darkvision",
      "keen_senses",
      "fey_ancestry",
      "trance",
      "race_elf_languages",
    ],
    hasSubraces: true,
    subraces: {
      subrace_elf_high: {
        id: "subrace_elf_high",
        name: "High Elf",
        grantedTraitIds: [
          "subrace_elf_high_asi",
          "elf_weapon_training",
          "subrace_elf_high_cantrip",
          "subrace_elf_high_extra_language",
        ],
      },
      subrace_elf_wood: {
        id: "subrace_elf_wood",
        name: "Wood Elf",
        grantedTraitIds: [
          "subrace_elf_wood_asi",
          "elf_weapon_training",
          "fleet_of_foot",
          "mask_of_the_wild",
        ],
      },
      subrace_elf_dark: {
        id: "subrace_elf_dark",
        name: "Dark Elf (Drow)",
        grantedTraitIds: [
          "subrace_elf_dark_asi",
          "subrace_elf_dark_superior_darkvision",
          "sunlight_sensitivity",
          "drow_magic",
          "drow_weapon_training",
        ],
      },
    },
  },

  race_gnome: {
    id: "race_gnome",
    name: "Gnome",
    size: "small",
    speed: 25,
    grantedTraitIds: [
      "race_gnome_asi",
      "race_gnome_darkvision",
      "gnome_cunning",
      "race_gnome_languages",
    ],
    hasSubraces: true,
    subraces: {
      subrace_gnome_forest: {
        id: "subrace_gnome_forest",
        name: "Forest Gnome",
        grantedTraitIds: [
          "subrace_gnome_forest_asi",
          "natural_illusionist",
          "speak_with_small_beasts",
        ],
      },
      subrace_gnome_rock: {
        id: "subrace_gnome_rock",
        name: "Rock Gnome",
        grantedTraitIds: [
          "subrace_gnome_rock_asi",
          "artificers_lore",
          "tinker",
        ],
      },
    },
  },

  race_half_elf: {
    id: "race_half_elf",
    name: "Half-Elf",
    size: "medium",
    speed: 30,
    grantedTraitIds: [
      "race_half_elf_asi",
      "race_half_elf_darkvision",
      // fey_ancestry is declared in the elf dictionary and shared by both races
      "fey_ancestry",
      "skill_versatility",
      "race_half_elf_languages",
    ],
    hasSubraces: false,
    subraces: {},
  },

  race_half_orc: {
    id: "race_half_orc",
    name: "Half-Orc",
    size: "medium",
    speed: 30,
    grantedTraitIds: [
      "race_half_orc_asi",
      "race_half_orc_darkvision",
      "menacing",
      "relentless_endurance",
      "savage_attacks",
      "race_half_orc_languages",
    ],
    hasSubraces: false,
    subraces: {},
  },

  race_halfling: {
    id: "race_halfling",
    name: "Halfling",
    size: "small",
    speed: 25,
    grantedTraitIds: [
      "race_halfling_asi",
      "lucky",
      "brave",
      "halfling_nimbleness",
      "race_halfling_languages",
    ],
    hasSubraces: true,
    subraces: {
      subrace_halfling_lightfoot: {
        id: "subrace_halfling_lightfoot",
        name: "Lightfoot Halfling",
        grantedTraitIds: [
          "subrace_halfling_lightfoot_asi",
          "naturally_stealthy",
        ],
      },
      subrace_halfling_stout: {
        id: "subrace_halfling_stout",
        name: "Stout Halfling",
        grantedTraitIds: ["subrace_halfling_stout_asi", "stout_resilience"],
      },
    },
  },

  race_human: {
    id: "race_human",
    name: "Human",
    size: "medium",
    speed: 30,
    grantedTraitIds: ["race_human_asi", "race_human_languages"],
    hasSubraces: false,
    subraces: {},
  },

  race_tiefling: {
    id: "race_tiefling",
    name: "Tiefling",
    size: "medium",
    speed: 30,
    grantedTraitIds: [
      "race_tiefling_asi",
      "race_tiefling_darkvision",
      "hellish_resistance",
      "infernal_legacy",
      "race_tiefling_languages",
    ],
    hasSubraces: false,
    subraces: {},
  },
};

export const resolveRaceDefinition = (
  raceId: string,
): RaceDefinition | undefined => RACE_DICTIONARY[raceId];

export const resolveSubraceDefinition = (
  raceId: string,
  subraceId: string,
): SubraceDefinition | undefined => RACE_DICTIONARY[raceId]?.subraces[subraceId];
