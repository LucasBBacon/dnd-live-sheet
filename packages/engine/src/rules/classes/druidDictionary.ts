import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const DRUID_CLASS: ClassDefinition = {
  id: "class_druid",
  name: "Druid",
  hitDie: 8,
  subclassUnlockLevel: 2,
  startingProficiencyTraitIds: [
    "trait_druid_prof_saving_throw",
    "trait_druid_prof_armor",
    "trait_druid_prof_weapons",
    "trait_druid_prof_tools",
    "trait_druid_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_druidic",
        "trait_spellcasting_druid",
        {
          type: "spell_choice",
          nodeId: "druid_level_1_cantrips",
          listSource: "druid",
          maxSpellLevel: 0,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 2,
      grants: ["trait_wild_shape", "trait_druid_circle"],
      grantsASI: false,
    },
    { level: 3, grants: [], grantsASI: false },
    {
      level: 4,
      grants: [
        "trait_wild_shape_improvement",
        {
          type: "spell_choice",
          nodeId: "druid_level_4_cantrips",
          listSource: "druid",
          maxSpellLevel: 0,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    { level: 5, grants: [], grantsASI: false },
    {
      level: 6,
      grants: ["trait_druid_circle_feature"],
      grantsASI: false,
    },
    { level: 7, grants: [], grantsASI: false },
    {
      level: 8,
      grants: ["trait_wild_shape_improvement"],
      grantsASI: true,
    },
    { level: 9, grants: [], grantsASI: false },
    {
      level: 10,
      grants: [
        "trait_druid_circle_feature",
        {
          type: "spell_choice",
          nodeId: "druid_level_10_cantrips",
          listSource: "druid",
          maxSpellLevel: 0,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 11, grants: [], grantsASI: false },
    { level: 12, grants: [], grantsASI: true },
    { level: 13, grants: [], grantsASI: false },
    {
      level: 14,
      grants: ["trait_druid_circle_feature"],
      grantsASI: false,
    },
    { level: 15, grants: [], grantsASI: false },
    { level: 16, grants: [], grantsASI: true },
    { level: 17, grants: [], grantsASI: false },
    {
      level: 18,
      grants: ["trait_timeless_body", "trait_beast_spells"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_archdruid"],
      grantsASI: false,
    },
  ],
};

export const DRUID_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_druid_land: {
    id: "subclass_druid_land",
    classId: "class_druid",
    name: "Circle of the Land",
    progression: [
      {
        level: 2,
        grants: ["trait_bonus_cantrip_druid_land", "trait_natural_recovery"],
      },
      {
        level: 3,
        grants: ["trait_land_circle_spells"],
      },
      {
        level: 6,
        grants: ["trait_lands_stride"],
      },
      {
        level: 10,
        grants: ["trait_natures_ward"],
      },
      {
        level: 14,
        grants: ["trait_natures_sanctuary"],
      },
    ],
  },
  subclass_druid_moon: {
    id: "subclass_druid_moon",
    classId: "class_druid",
    name: "Circle of the Moon",
    progression: [
      {
        level: 2,
        grants: ["trait_combat_wild_shape", "trait_wild_form"],
      },
      {
        level: 6,
        grants: ["trait_primal_strike"],
      },
      {
        level: 10,
        grants: ["trait_elemental_wild_shape"],
      },
      {
        level: 14,
        grants: ["trait_thousand_forms"],
      },
    ],
  },
};
