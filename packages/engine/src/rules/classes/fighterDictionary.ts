import type { ClassDefinition } from "@project/shared";
import { CLASS_STARTING_EQUIPMENT } from "../startingEquipmentDictionary.js";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const FIGHTER_CLASS: ClassDefinition = {
  id: "class_fighter",
  name: "Fighter",
  hitDie: 10,
  subclassUnlockLevel: 3,
  startingEquipment: CLASS_STARTING_EQUIPMENT.class_fighter,
  multiclassTraitIds: [
    "trait_fighter_mult_prof_armor",
    "trait_fighter_mult_prof_weapons",
  ],
  multiclassPrerequisites: {
    anyOf: [{ str: 13 }, { dex: 13 }],
  },
  startingProficiencyTraitIds: [
    "trait_fighter_prof_saving_throw",
    "trait_fighter_prof_armor",
    "trait_fighter_prof_weapons",
    "trait_fighter_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        {
          type: "trait_choice",
          nodeId: "fighter_level_1_fighting_style",
          options: [
            "trait_fs_archery",
            "trait_fs_defense",
            "trait_fs_dueling",
            "trait_fs_great_weapon_fighting",
            "trait_fs_protection",
            "trait_fs_two_weapon_fighting",
          ],
          pickCount: 1,
        },
        "trait_second_wind",
      ],
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
        grants: [
          "trait_combat_superiority",
          "trait_student_of_war",
          {
            type: "trait_choice",
            nodeId: "fighter_bm_level_3_maneuvers",
            options: [
              "trait_maneuver_commanders_strike",
              "trait_maneuver_disarming_attack",
              "trait_maneuver_distracting_strike",
              "trait_maneuver_evasive_footwork",
              "trait_maneuver_feinting_attack",
              "trait_maneuver_goading_attack",
              "trait_maneuver_lunging_attack",
              "trait_maneuver_maneuvering_attack",
              "trait_maneuver_menacing_attack",
              "trait_maneuver_parry",
              "trait_maneuver_precision_attack",
              "trait_maneuver_pushing_attack",
              "trait_maneuver_rally",
              "trait_maneuver_riposte",
              "trait_maneuver_sweeping_attack",
              "trait_maneuver_trip_attack",
            ],
            pickCount: 3,
          },
        ],
      },
      {
        level: 7,
        grants: [
          "trait_know_your_enemy",
          {
            type: "trait_choice",
            nodeId: "fighter_bm_level_7_maneuvers",
            options: [
              "trait_maneuver_commanders_strike",
              "trait_maneuver_disarming_attack",
              "trait_maneuver_distracting_strike",
              "trait_maneuver_evasive_footwork",
              "trait_maneuver_feinting_attack",
              "trait_maneuver_goading_attack",
              "trait_maneuver_lunging_attack",
              "trait_maneuver_maneuvering_attack",
              "trait_maneuver_menacing_attack",
              "trait_maneuver_parry",
              "trait_maneuver_precision_attack",
              "trait_maneuver_pushing_attack",
              "trait_maneuver_rally",
              "trait_maneuver_riposte",
              "trait_maneuver_sweeping_attack",
              "trait_maneuver_trip_attack",
            ],
            pickCount: 2,
          },
        ],
      },
      {
        level: 10,
        grants: [
          "trait_improved_combat_superiority",
          {
            type: "trait_choice",
            nodeId: "fighter_bm_level_10_maneuvers",
            options: [
              "trait_maneuver_commanders_strike",
              "trait_maneuver_disarming_attack",
              "trait_maneuver_distracting_strike",
              "trait_maneuver_evasive_footwork",
              "trait_maneuver_feinting_attack",
              "trait_maneuver_goading_attack",
              "trait_maneuver_lunging_attack",
              "trait_maneuver_maneuvering_attack",
              "trait_maneuver_menacing_attack",
              "trait_maneuver_parry",
              "trait_maneuver_precision_attack",
              "trait_maneuver_pushing_attack",
              "trait_maneuver_rally",
              "trait_maneuver_riposte",
              "trait_maneuver_sweeping_attack",
              "trait_maneuver_trip_attack",
            ],
            pickCount: 2,
          },
        ],
      },
      {
        level: 15,
        grants: [
          "trait_relentless",
          {
            type: "trait_choice",
            nodeId: "fighter_bm_level_15_maneuvers",
            options: [
              "trait_maneuver_commanders_strike",
              "trait_maneuver_disarming_attack",
              "trait_maneuver_distracting_strike",
              "trait_maneuver_evasive_footwork",
              "trait_maneuver_feinting_attack",
              "trait_maneuver_goading_attack",
              "trait_maneuver_lunging_attack",
              "trait_maneuver_maneuvering_attack",
              "trait_maneuver_menacing_attack",
              "trait_maneuver_parry",
              "trait_maneuver_precision_attack",
              "trait_maneuver_pushing_attack",
              "trait_maneuver_rally",
              "trait_maneuver_riposte",
              "trait_maneuver_sweeping_attack",
              "trait_maneuver_trip_attack",
            ],
            pickCount: 2,
          },
        ],
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
        grants: [
          {
            type: "trait_choice",
            nodeId: "fighter_champion_level_10_fighting_style",
            options: [
              "trait_fs_archery",
              "trait_fs_defense",
              "trait_fs_dueling",
              "trait_fs_great_weapon_fighting",
              "trait_fs_protection",
              "trait_fs_two_weapon_fighting",
            ],
            pickCount: 1,
          },
        ],
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
