import type { ClassDefinition } from "@project/shared";
import { CLASS_STARTING_EQUIPMENT } from "../startingEquipmentDictionary.js";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const BARD_CLASS: ClassDefinition = {
  id: "class_bard",
  name: "Bard",
  hitDie: 8,
  subclassUnlockLevel: 3,
  startingEquipment: CLASS_STARTING_EQUIPMENT.class_bard,
  multiclassTraitIds: [
    "trait_bard_prof_mult_armor",
    "trait_bard_prof_mult_tools",
    "trait_bard_prof_mult_skills",
  ],
  multiclassPrerequisites: { abilityMinimums: { cha: 13 } },
  startingProficiencyTraitIds: [
    "trait_bard_prof_saving_throw",
    "trait_bard_prof_armor",
    "trait_bard_prof_weapons",
    "trait_bard_prof_tools",
    "trait_bard_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_spellcasting_bard",
        "trait_bardic_inspiration",
        {
          type: "spell_choice",
          nodeId: "bard_level_1_cantrips",
          listSource: "bard",
          maxSpellLevel: 0,
          pickCount: 2,
        },
        {
          type: "spell_choice",
          nodeId: "bard_level_1_spells_known",
          listSource: "bard",
          maxSpellLevel: 1,
          pickCount: 4,
        },
      ],
      grantsASI: false,
    },
    {
      level: 2,
      grants: [
        "trait_jack_of_all_trades",
        "trait_song_of_rest",
        {
          type: "spell_choice",
          nodeId: "bard_level_2_spells_known",
          listSource: "bard",
          maxSpellLevel: 1,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 3,
      grants: [
        "trait_bard_college",
        "trait_expertise",
        {
          type: "spell_choice",
          nodeId: "bard_level_3_spells_known",
          listSource: "bard",
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
          nodeId: "bard_level_4_cantrips",
          listSource: "bard",
          maxSpellLevel: 0,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "bard_level_4_spells_known",
          listSource: "bard",
          maxSpellLevel: 2,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 5,
      grants: [
        "trait_bardic_inspiration",
        "trait_font_of_inspiration",
        {
          type: "spell_choice",
          nodeId: "bard_level_5_spells_known",
          listSource: "bard",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 6,
      grants: [
        "trait_countercharm",
        "trait_bard_college_feature",
        {
          type: "spell_choice",
          nodeId: "bard_level_6_spells_known",
          listSource: "bard",
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
          nodeId: "bard_level_7_spells_known",
          listSource: "bard",
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
          nodeId: "bard_level_8_spells_known",
          listSource: "bard",
          maxSpellLevel: 4,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 9,
      grants: [
        "trait_song_of_rest",
        {
          type: "spell_choice",
          nodeId: "bard_level_9_spells_known",
          listSource: "bard",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 10,
      grants: [
        "trait_bardic_inspiration",
        "trait_expertise",
        "trait_magical_secrets",
        {
          type: "spell_choice",
          nodeId: "bard_level_10_cantrips",
          listSource: "bard",
          maxSpellLevel: 0,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "bard_level_10_magical_secrets",
          listSource: "any",
          maxSpellLevel: 5,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 11,
      grants: [
        {
          type: "spell_choice",
          nodeId: "bard_level_11_spells_known",
          listSource: "bard",
          maxSpellLevel: 6,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    {
      level: 13,
      grants: [
        "trait_song_of_rest",
        {
          type: "spell_choice",
          nodeId: "bard_level_13_spells_known",
          listSource: "bard",
          maxSpellLevel: 7,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 14,
      grants: [
        "trait_magical_secrets",
        "trait_bard_college_feature",
        {
          type: "spell_choice",
          nodeId: "bard_level_14_magical_secrets",
          listSource: "any",
          maxSpellLevel: 7,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 15,
      grants: [
        "trait_bardic_inspiration",
        {
          type: "spell_choice",
          nodeId: "bard_level_15_spells_known",
          listSource: "bard",
          maxSpellLevel: 8,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 16, grants: [], grantsASI: true },
    {
      level: 17,
      grants: [
        "trait_song_of_rest",
        {
          type: "spell_choice",
          nodeId: "bard_level_17_spells_known",
          listSource: "bard",
          maxSpellLevel: 9,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 18,
      grants: [
        "trait_magical_secrets",
        {
          type: "spell_choice",
          nodeId: "bard_level_18_magical_secrets",
          listSource: "any",
          maxSpellLevel: 9,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_superior_inspiration"],
      grantsASI: false,
    },
  ],
};

export const BARD_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_bard_lore: {
    id: "subclass_bard_lore",
    classId: "class_bard",
    name: "College of Lore",
    progression: [
      {
        level: 3,
        grants: ["trait_bard_lore_prof_bonus", "trait_cutting_words"],
      },
      {
        level: 6,
        grants: [
          "trait_additional_magical_secrets",
          {
            type: "spell_choice",
            nodeId: "bard_lore_level_6_additional_magical_secrets",
            listSource: "any",
            maxSpellLevel: 3,
            pickCount: 2,
          },
        ],
      },
      {
        level: 14,
        grants: ["trait_peerless_skill"],
      },
    ],
  },
  subclass_bard_valor: {
    id: "subclass_bard_valor",
    classId: "class_bard",
    name: "College of Valor",
    progression: [
      {
        level: 3,
        grants: ["trait_bard_valor_bonus_prof", "trait_combat_inspiration"],
      },
      {
        level: 6,
        grants: ["trait_extra_attack"],
      },
      {
        level: 14,
        grants: ["trait_battle_magic"],
      },
    ],
  },
};
