import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const SORCERER_CLASS: ClassDefinition = {
  id: "class_sorcerer",
  name: "Sorcerer",
  hitDie: 6,
  subclassUnlockLevel: 1,
  startingProficiencyTraitIds: [
    "trait_sorcerer_prof_saving_throw",
    "trait_sorcerer_prof_weapons",
    "trait_sorcerer_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_spellcasting_sorcerer",
        "trait_sorcerous_origin",
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_1_cantrips",
          listSource: "sorcerer",
          maxSpellLevel: 0,
          pickCount: 4,
        },
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_1_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 1,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 2,
      grants: [
        "trait_font_of_magic",
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_2_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 1,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 3,
      grants: [
        {
          type: "trait_choice",
          nodeId: "sorcerer_level_3_metamagic",
          options: [
            "trait_metamagic_careful_spell",
            "trait_metamagic_distant_spell",
            "trait_metamagic_empowered_spell",
            "trait_metamagic_extended_spell",
            "trait_metamagic_heightened_spell",
            "trait_metamagic_quickened_spell",
            "trait_metamagic_subtle_spell",
            "trait_metamagic_twinned_spell",
          ],
          pickCount: 2,
        },
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_3_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 2,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 4,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_4_cantrips",
          listSource: "sorcerer",
          maxSpellLevel: 0,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_4_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 2,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 5,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_5_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 6,
      grants: [
        "trait_sorcerous_origin_feature",
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_6_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 7,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_7_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 4,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 8,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_8_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 4,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 9,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_9_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 10,
      grants: [
        {
          type: "trait_choice",
          nodeId: "sorcerer_level_10_metamagic",
          options: [
            "trait_metamagic_careful_spell",
            "trait_metamagic_distant_spell",
            "trait_metamagic_empowered_spell",
            "trait_metamagic_extended_spell",
            "trait_metamagic_heightened_spell",
            "trait_metamagic_quickened_spell",
            "trait_metamagic_subtle_spell",
            "trait_metamagic_twinned_spell",
          ],
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_10_cantrips",
          listSource: "sorcerer",
          maxSpellLevel: 0,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_10_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 11, grants: [], grantsASI: false },
    {
      level: 12,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_12_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 6,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    { level: 13, grants: [], grantsASI: false },
    {
      level: 14,
      grants: [
        "trait_sorcerous_origin_feature",
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_14_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 7,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 15, grants: [], grantsASI: false },
    {
      level: 16,
      grants: [
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_16_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 8,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 17,
      grants: [
        {
          type: "trait_choice",
          nodeId: "sorcerer_level_17_metamagic",
          options: [
            "trait_metamagic_careful_spell",
            "trait_metamagic_distant_spell",
            "trait_metamagic_empowered_spell",
            "trait_metamagic_extended_spell",
            "trait_metamagic_heightened_spell",
            "trait_metamagic_quickened_spell",
            "trait_metamagic_subtle_spell",
            "trait_metamagic_twinned_spell",
          ],
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 18,
      grants: [
        "trait_sorcerous_origin_feature",
        {
          type: "spell_choice",
          nodeId: "sorcerer_level_18_spells_known",
          listSource: "sorcerer",
          maxSpellLevel: 9,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_sorcerous_restoration"],
      grantsASI: false,
    },
  ],
};

export const SORCERER_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_sorcerer_draconic: {
    id: "subclass_sorcerer_draconic",
    classId: "class_sorcerer",
    name: "Draconic Bloodline",
    progression: [
      {
        level: 1,
        grants: [
          {
            type: "trait_choice",
            nodeId: "sorcerer_draconic_level_1_ancestor",
            options: [
              "trait_dragon_ancestor_black",
              "trait_dragon_ancestor_blue",
              "trait_dragon_ancestor_brass",
              "trait_dragon_ancestor_bronze",
              "trait_dragon_ancestor_copper",
              "trait_dragon_ancestor_gold",
              "trait_dragon_ancestor_green",
              "trait_dragon_ancestor_red",
              "trait_dragon_ancestor_silver",
              "trait_dragon_ancestor_white",
            ],
            pickCount: 1,
          },
          "trait_draconic_resilience",
        ],
      },
      {
        level: 6,
        grants: ["trait_elemental_affinity"],
      },
      {
        level: 14,
        grants: ["trait_dragon_wings"],
      },
      {
        level: 18,
        grants: ["trait_draconic_presence"],
      },
    ],
  },
  subclass_sorcerer_wild_magic: {
    id: "subclass_sorcerer_wild_magic",
    classId: "class_sorcerer",
    name: "Wild Magic",
    progression: [
      {
        level: 1,
        grants: ["trait_wild_magic_surge", "trait_tides_of_chaos"],
      },
      {
        level: 6,
        grants: ["trait_bend_luck"],
      },
      {
        level: 14,
        grants: ["trait_controlled_chaos"],
      },
      {
        level: 18,
        grants: ["trait_spell_bombardment"],
      },
    ],
  },
};
