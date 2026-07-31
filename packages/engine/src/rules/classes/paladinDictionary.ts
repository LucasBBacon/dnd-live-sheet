import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const PALADIN_CLASS: ClassDefinition = {
  id: "class_paladin",
  name: "Paladin",
  hitDie: 10,
  subclassUnlockLevel: 3,
  startingProficiencyTraitIds: [
    "trait_paladin_prof_saving_throw",
    "trait_paladin_prof_armor",
    "trait_paladin_prof_weapons",
    "trait_paladin_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: ["trait_divine_sense", "trait_lay_on_hands"],
      grantsASI: false,
    },
    {
      level: 2,
      grants: [
        {
          type: "trait_choice",
          nodeId: "paladin_level_2_fighting_style",
          options: [
            "trait_fs_defense",
            "trait_fs_dueling",
            "trait_fs_great_weapon_fighting",
            "trait_fs_protection",
          ],
          pickCount: 1,
        },
        "trait_divine_smite",
        "trait_spellcasting_paladin",
      ],
      grantsASI: false,
    },
    {
      level: 3,
      grants: ["trait_divine_health", "trait_sacred_oath"],
      grantsASI: false,
    },
    { level: 4, grants: [], grantsASI: true },
    {
      level: 5,
      grants: ["trait_extra_attack"],
      grantsASI: false,
    },
    {
      level: 6,
      grants: ["trait_aura_of_protection"],
      grantsASI: false,
    },
    {
      level: 7,
      grants: ["trait_sacred_oath_feature"],
      grantsASI: false,
    },
    { level: 8, grants: [], grantsASI: true },
    { level: 9, grants: [], grantsASI: false },
    {
      level: 10,
      grants: ["trait_aura_of_courage"],
      grantsASI: false,
    },
    {
      level: 11,
      grants: ["trait_improved_divine_strike"],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    { level: 13, grants: [], grantsASI: false },
    {
      level: 14,
      grants: ["trait_cleansing_touch"],
      grantsASI: false,
    },
    {
      level: 15,
      grants: ["trait_sacred_oath_feature"],
      grantsASI: false,
    },
    { level: 16, grants: [], grantsASI: true },
    { level: 17, grants: [], grantsASI: false },
    {
      level: 18,
      grants: ["trait_aura_improvements"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_sacred_oath_feature"],
      grantsASI: false,
    },
  ],
};

export const PALADIN_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_paladin_ancients: {
    id: "subclass_paladin_ancients",
    classId: "class_paladin",
    name: "Oath of the Ancients",
    progression: [
      {
        level: 3,
        grants: [
          "trait_ancients_oath_spells",
          "trait_cd_natures_wrath",
          "trait_cd_turn_the_faithless",
        ],
      },
      {
        level: 7,
        grants: ["trait_aura_of_warding"],
      },
      {
        level: 15,
        grants: ["trait_undying_sentinel"],
      },
      {
        level: 20,
        grants: ["trait_elder_champion"],
      },
    ],
  },
  subclass_paladin_devotion: {
    id: "subclass_paladin_devotion",
    classId: "class_paladin",
    name: "Oath of Devotion",
    progression: [
      {
        level: 3,
        grants: [
          "trait_devotion_oath_spells",
          "trait_cd_sacred_weapon",
          "trait_cd_turn_the_unholy",
        ],
      },
      {
        level: 7,
        grants: ["trait_aura_of_devotion"],
      },
      {
        level: 15,
        grants: ["trait_purity_of_spirit"],
      },
      {
        level: 20,
        grants: ["trait_holy_nimbus"],
      },
    ],
  },
  subclass_paladin_vengeance: {
    id: "subclass_paladin_vengeance",
    classId: "class_paladin",
    name: "Oath of Vengeance",
    progression: [
      {
        level: 3,
        grants: [
          "trait_vengeance_oath_spells",
          "trait_cd_abjure_enemy",
          "trait_cd_vow_of_enmity",
        ],
      },
      {
        level: 7,
        grants: ["trait_relentless_avenger"],
      },
      {
        level: 15,
        grants: ["trait_soul_of_vengeance"],
      },
      {
        level: 20,
        grants: ["trait_avenging_angel"],
      },
    ],
  },
};
