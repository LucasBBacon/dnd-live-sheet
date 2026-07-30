import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const FIGHTER_CLASS: ClassDefinition = {
  id: "class_fighter",
  name: "Fighter",
  hitDie: 10,
  subclassUnlockLevel: 3,
  startingProficiencyTraitIds: [
    "trait_fighter_prof_saving_throw",
    "trait_fighter_prof_armor",
    "trait_fighter_prof_weapons",
    "trait_fighter_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: ["trait_fighting_style", "trait_second_wind"],
      grantsASI: false,
    },
    {
      level: 2,
      grants: ["trait_action_surge"],
      grantsASI: false,
    },
    {
      level: 3,
      grants: ["trait_martial_archetype"],
      grantsASI: false,
    },
    { level: 4, grants: [], grantsASI: true },
    {
      level: 5,
      grants: ["trait_extra_attack"],
      grantsASI: false,
    },
    { level: 6, grants: [], grantsASI: true },
    {
      level: 7,
      grants: ["trait_martial_archetype_feature"],
      grantsASI: false,
    },
    { level: 8, grants: [], grantsASI: true },
    {
      level: 9,
      grants: ["trait_indomitable"],
      grantsASI: false,
    },
    {
      level: 10,
      grants: ["trait_martial_archetype_feature"],
      grantsASI: false,
    },
    {
      level: 11,
      grants: ["trait_extra_attack"],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    {
      level: 13,
      grants: ["trait_indomitable"],
      grantsASI: false,
    },
    { level: 14, grants: [], grantsASI: true },
    {
      level: 15,
      grants: ["trait_martial_archetype_feature"],
      grantsASI: false,
    },
    { level: 16, grants: [], grantsASI: true },
    {
      level: 17,
      grants: ["trait_action_surge", "trait_indomitable"],
      grantsASI: false,
    },
    {
      level: 18,
      grants: ["trait_martial_archetype_feature"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_extra_attack"],
      grantsASI: false,
    },
  ],
};

export const FIGHTER_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_fighter_battle_master: {
    id: "subclass_fighter_battle_master",
    classId: "class_fighter",
    name: "Battle Master",
    progression: [
      {
        level: 3,
        grants: ["trait_combat_superiority", "trait_student_of_war"],
      },
      {
        level: 7,
        grants: ["trait_know_your_enemy"],
      },
      {
        level: 10,
        grants: ["trait_improved_combat_superiority"],
      },
      {
        level: 15,
        grants: ["trait_relentless"],
      },
      {
        level: 18,
        grants: ["trait_improved_combat_superiority"],
      },
    ],
  },
  subclass_fighter_champion: {
    id: "subclass_fighter_champion",
    classId: "class_fighter",
    name: "Champion",
    progression: [
      {
        level: 3,
        grants: ["trait_improved_critical"],
      },
      {
        level: 7,
        grants: ["trait_remarkable_athlete"],
      },
      {
        level: 10,
        grants: ["trait_additional_fighting_style"],
      },
      {
        level: 15,
        grants: ["trait_superior_critical"],
      },
      {
        level: 18,
        grants: ["trait_survivor"],
      },
    ],
  },
  subclass_fighter_eldritch_knight: {
    id: "subclass_fighter_eldritch_knight",
    classId: "class_fighter",
    name: "Eldritch Knight",
    progression: [
      {
        level: 3,
        grants: [
          "trait_fighter_eldritch_knight_spellcasting",
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_3_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 2,
          },
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_3_spells_known",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 3,
          },
        ],
      },
      {
        level: 4,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_4_spells_known",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 1,
          },
        ],
      },
      {
        level: 7,
        grants: [
          "trait_war_magic",
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_7_spells_known",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 1,
          },
        ],
      },
      {
        level: 8,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_8_spells_known",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 1,
          },
        ],
      },
      {
        level: 10,
        grants: [
          "trait_eldritch_strike",
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_10_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 1,
          },
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_10_spells_known",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 1,
          },
        ],
      },
      {
        level: 11,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_11_spells_known",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 1,
          },
        ],
      },
      {
        level: 13,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_13_spells_known",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 1,
          },
        ],
      },
      {
        level: 14,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_14_spells_known",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 1,
          },
        ],
      },
      {
        level: 15,
        grants: ["trait_arcane_charge"],
      },
      {
        level: 16,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_16_spells_known",
            listSource: "wizard",
            maxSpellLevel: 3,
            pickCount: 1,
          },
        ],
      },
      {
        level: 18,
        grants: ["trait_improved_war_magic"],
      },
      {
        level: 19,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_19_spells_known",
            listSource: "wizard",
            maxSpellLevel: 4,
            pickCount: 1,
          },
        ],
      },
      {
        level: 20,
        grants: [
          {
            type: "spell_choice",
            nodeId: "eldritch_knight_level_20_spells_known",
            listSource: "wizard",
            maxSpellLevel: 4,
            pickCount: 1,
          },
        ],
      },
    ],
  },
};
