import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const RANGER_CLASS: ClassDefinition = {
  id: "class_ranger",
  name: "Ranger",
  hitDie: 10,
  subclassUnlockLevel: 3,
  startingProficiencyTraitIds: [
    "trait_ranger_prof_saving_throw",
    "trait_ranger_prof_armor",
    "trait_ranger_prof_weapons",
    "trait_ranger_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: ["trait_favored_enemy", "trait_natural_explorer"],
      grantsASI: false,
    },
    {
      level: 2,
      grants: [
        "trait_fighting_style",
        "trait_spellcasting_ranger",
        {
          type: "spell_choice",
          nodeId: "ranger_level_2_spells_known",
          listSource: "ranger",
          maxSpellLevel: 1,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 3,
      grants: [
        "trait_ranger_archetype",
        "trait_primeval_awareness",
        {
          type: "spell_choice",
          nodeId: "ranger_level_3_spells_known",
          listSource: "ranger",
          maxSpellLevel: 1,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 4, grants: [], grantsASI: true },
    {
      level: 5,
      grants: [
        "trait_extra_attack",
        {
          type: "spell_choice",
          nodeId: "ranger_level_5_spells_known",
          listSource: "ranger",
          maxSpellLevel: 2,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 6,
      grants: [
        "trait_favored_enemy_improvement",
        "trait_natural_explorer_improvement",
      ],
      grantsASI: false,
    },
    {
      level: 7,
      grants: [
        "trait_ranger_archetype_feature",
        {
          type: "spell_choice",
          nodeId: "ranger_level_7_spells_known",
          listSource: "ranger",
          maxSpellLevel: 2,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 8,
      grants: ["trait_lands_stride"],
      grantsASI: true,
    },
    {
      level: 9,
      grants: [
        {
          type: "spell_choice",
          nodeId: "ranger_level_9_spells_known",
          listSource: "ranger",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 10,
      grants: [
        "trait_natural_explorer_improvement",
        "trait_hide_in_plain_sight",
      ],
      grantsASI: false,
    },
    {
      level: 11,
      grants: [
        "trait_ranger_archetype_feature",
        {
          type: "spell_choice",
          nodeId: "ranger_level_11_spells_known",
          listSource: "ranger",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    {
      level: 13,
      grants: [
        {
          type: "spell_choice",
          nodeId: "ranger_level_13_spells_known",
          listSource: "ranger",
          maxSpellLevel: 4,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 14,
      grants: ["trait_favored_enemy_improvement", "trait_vanish"],
      grantsASI: false,
    },
    {
      level: 15,
      grants: [
        "trait_ranger_archetype_feature",
        {
          type: "spell_choice",
          nodeId: "ranger_level_15_spells_known",
          listSource: "ranger",
          maxSpellLevel: 4,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 16, grants: [], grantsASI: true },
    {
      level: 17,
      grants: [
        {
          type: "spell_choice",
          nodeId: "ranger_level_17_spells_known",
          listSource: "ranger",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 18,
      grants: ["trait_feral_senses"],
      grantsASI: false,
    },
    {
      level: 19,
      grants: [
        {
          type: "spell_choice",
          nodeId: "ranger_level_19_spells_known",
          listSource: "ranger",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 20,
      grants: ["trait_foe_slayer"],
      grantsASI: false,
    },
  ],
};

export const RANGER_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_ranger_beast_master: {
    id: "subclass_ranger_beast_master",
    classId: "class_ranger",
    name: "Beast Master",
    progression: [
      {
        level: 3,
        grants: ["trait_rangers_companion"],
      },
      {
        level: 7,
        grants: ["trait_exceptional_training"],
      },
      {
        level: 11,
        grants: ["trait_bestial_fury"],
      },
      {
        level: 15,
        grants: ["trait_share_spells"],
      },
    ],
  },
  subclass_ranger_hunter: {
    id: "subclass_ranger_hunter",
    classId: "class_ranger",
    name: "Hunter",
    progression: [
      {
        level: 3,
        grants: ["trait_hunters_prey"],
      },
      {
        level: 7,
        grants: ["trait_defensive_tactics"],
      },
      {
        level: 11,
        grants: ["trait_multiattack"],
      },
      {
        level: 15,
        grants: ["trait_superior_hunters_defense"],
      },
    ],
  },
};
