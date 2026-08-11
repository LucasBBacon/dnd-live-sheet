import type { ClassDefinition } from "@project/shared";
import { CLASS_STARTING_EQUIPMENT } from "../startingEquipmentDictionary.js";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const CLERIC_CLASS: ClassDefinition = {
  id: "class_cleric",
  name: "Cleric",
  hitDie: 8,
  subclassUnlockLevel: 1,
  startingEquipment: CLASS_STARTING_EQUIPMENT.class_cleric,
  multiclassTraitIds: [
    "trait_cleric_mult_prof_armor",
    "trait_cleric_mult_prof_weapons",
  ],
  multiclassPrerequisites: { abilityMinimums: { wis: 13 } },
  startingProficiencyTraitIds: [
    "trait_cleric_prof_saving_throw",
    "trait_cleric_prof_armor",
    "trait_cleric_prof_weapons",
    "trait_cleric_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_spellcasting_cleric",
        "trait_divine_domain",
        {
          type: "spell_choice",
          nodeId: "cleric_level_1_cantrips",
          listSource: "cleric",
          maxSpellLevel: 0,
          pickCount: 3,
        },
      ],
      grantsASI: false,
    },
    {
      level: 2,
      grants: ["trait_channel_divinity", "trait_divine_domain_feature"],
      grantsASI: false,
    },
    { level: 3, grants: [], grantsASI: false },
    {
      level: 4,
      grants: [
        {
          type: "spell_choice",
          nodeId: "cleric_level_4_cantrips",
          listSource: "cleric",
          maxSpellLevel: 0,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 5,
      grants: ["trait_destroy_undead"],
      grantsASI: false,
    },
    {
      level: 6,
      grants: ["trait_channel_divinity", "trait_divine_domain_feature"],
      grantsASI: false,
    },
    { level: 7, grants: [], grantsASI: false },
    {
      level: 8,
      grants: ["trait_destroy_undead", "trait_divine_domain_feature"],
      grantsASI: true,
    },
    { level: 9, grants: [], grantsASI: false },
    {
      level: 10,
      grants: [
        "trait_divine_intervention",
        {
          type: "spell_choice",
          nodeId: "cleric_level_10_cantrips",
          listSource: "cleric",
          maxSpellLevel: 0,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 11,
      grants: ["trait_destroy_undead"],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    { level: 13, grants: [], grantsASI: false },
    {
      level: 14,
      grants: ["trait_destroy_undead"],
      grantsASI: false,
    },
    { level: 15, grants: [], grantsASI: false },
    { level: 16, grants: [], grantsASI: true },
    {
      level: 17,
      grants: ["trait_destroy_undead", "trait_divine_domain_feature"],
      grantsASI: false,
    },
    {
      level: 18,
      grants: ["trait_channel_divinity"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_divine_intervention_improvement"],
      grantsASI: false,
    },
  ],
};

export const CLERIC_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_cleric_knowledge: {
    id: "subclass_cleric_knowledge",
    classId: "class_cleric",
    name: "Knowledge Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_knowledge_domain_spells",
          "trait_blessings_of_knowledge",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_knowledge_of_the_ages"],
      },
      {
        level: 6,
        grants: ["trait_cd_read_thoughts"],
      },
      {
        level: 8,
        grants: ["trait_potent_spellcasting"],
      },
      {
        level: 17,
        grants: ["trait_visions_of_the_past"],
      },
    ],
  },
  subclass_cleric_life: {
    id: "subclass_cleric_life",
    classId: "class_cleric",
    name: "Life Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_cleric_life_prof_bonus",
          "trait_disciple_of_life",
          "trait_cleric_life_domain_spells",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_preserve_life"],
      },
      {
        level: 6,
        grants: ["trait_blessed_healer"],
      },
      {
        level: 8,
        grants: ["trait_divine_strike"],
      },
      {
        level: 17,
        grants: ["trait_supreme_healing"],
      },
    ],
  },
  subclass_cleric_light: {
    id: "subclass_cleric_light",
    classId: "class_cleric",
    name: "Light Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_light_domain_spells",
          "trait_cleric_light_bonus_cantrip",
          "trait_warding_flare",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_radiance_of_the_dawn"],
      },
      {
        level: 6,
        grants: ["trait_improved_flare"],
      },
      {
        level: 8,
        grants: ["trait_potent_spellcasting"],
      },
      {
        level: 17,
        grants: ["trait_corona_of_light"],
      },
    ],
  },
  subclass_cleric_nature: {
    id: "subclass_cleric_nature",
    classId: "class_cleric",
    name: "Nature Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_nature_domain_spells",
          "trait_acolyte_of_nature",
          "trait_cleric_nature_prof_bonus",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_charm_animals_and_plants"],
      },
      {
        level: 6,
        grants: ["trait_dampen_elements"],
      },
      {
        level: 8,
        grants: ["trait_divine_strike"],
      },
      {
        level: 17,
        grants: ["trait_master_of_nature"],
      },
    ],
  },
  subclass_cleric_tempest_subclass: {
    id: "subclass_cleric_tempest_subclass",
    classId: "class_cleric",
    name: "Tempest Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_tempest_domain_spells",
          "trait_cleric_tempest_prof_bonus",
          "trait_wrath_of_the_storm",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_destructive_wrath"],
      },
      {
        level: 6,
        grants: ["trait_thunderous_strike"],
      },
      {
        level: 8,
        grants: ["trait_divine_strike"],
      },
      {
        level: 17,
        grants: ["trait_stormborn"],
      },
    ],
  },
  subclass_cleric_trickery: {
    id: "subclass_cleric_trickery",
    classId: "class_cleric",
    name: "Trickery Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_trickery_domain_spells",
          "trait_blessing_of_the_trickster",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_invoke_duplicity"],
      },
      {
        level: 6,
        grants: ["trait_cd_cloak_of_shadows"],
      },
      {
        level: 8,
        grants: ["trait_divine_strike"],
      },
      {
        level: 17,
        grants: ["trait_improved_duplicity"],
      },
    ],
  },
  subclass_cleric_war: {
    id: "subclass_cleric_war",
    classId: "class_cleric",
    name: "War Domain",
    progression: [
      {
        level: 1,
        grants: [
          "trait_war_domain_spells",
          "trait_cleric_war_prof_bonus",
          "trait_war_priest",
        ],
      },
      {
        level: 2,
        grants: ["trait_cd_guided_strike"],
      },
      {
        level: 6,
        grants: ["trait_cd_war_gods_blessing"],
      },
      {
        level: 8,
        grants: ["trait_divine_strike"],
      },
      {
        level: 17,
        grants: ["trait_avatar_of_battle"],
      },
    ],
  },
};
