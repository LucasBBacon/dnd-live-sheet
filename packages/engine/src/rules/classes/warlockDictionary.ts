import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const WARLOCK_CLASS: ClassDefinition = {
  id: "class_warlock",
  name: "Warlock",
  hitDie: 8,
  subclassUnlockLevel: 1,
  startingProficiencyTraitIds: [
    "trait_warlock_prof_saving_throw",
    "trait_warlock_prof_armor",
    "trait_warlock_prof_weapons",
    "trait_warlock_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_otherworldly_patron",
        "trait_pact_magic",
        {
          type: "spell_choice",
          nodeId: "warlock_level_1_cantrips",
          listSource: "warlock",
          maxSpellLevel: 0,
          pickCount: 2,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_1_spells_known",
          listSource: "warlock",
          maxSpellLevel: 1,
          pickCount: 2,
        },
      ],
      grantsASI: false,
    },
    {
      level: 2,
      grants: [
        "trait_eldritch_invocations",
        {
          type: "spell_choice",
          nodeId: "warlock_level_2_spells_known",
          listSource: "warlock",
          maxSpellLevel: 1,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 3,
      grants: [
        "trait_pact_boon",
        {
          type: "spell_choice",
          nodeId: "warlock_level_3_spells_known",
          listSource: "warlock",
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
          nodeId: "warlock_level_4_cantrips",
          listSource: "warlock",
          maxSpellLevel: 0,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_4_spells_known",
          listSource: "warlock",
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
          nodeId: "warlock_level_5_spells_known",
          listSource: "warlock",
          maxSpellLevel: 3,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 6,
      grants: [
        "trait_otherworldly_patron_feature",
        {
          type: "spell_choice",
          nodeId: "warlock_level_6_spells_known",
          listSource: "warlock",
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
          nodeId: "warlock_level_7_spells_known",
          listSource: "warlock",
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
          nodeId: "warlock_level_8_spells_known",
          listSource: "warlock",
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
          nodeId: "warlock_level_9_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 10,
      grants: [
        "trait_otherworldly_patron_feature",
        {
          type: "spell_choice",
          nodeId: "warlock_level_10_cantrips",
          listSource: "warlock",
          maxSpellLevel: 0,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 11,
      grants: [
        "trait_mystic_arcanum_6",
        {
          type: "spell_choice",
          nodeId: "warlock_level_11_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_11_mystic_arcanum",
          listSource: "warlock",
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
        "trait_mystic_arcanum_7",
        {
          type: "spell_choice",
          nodeId: "warlock_level_13_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_13_mystic_arcanum",
          listSource: "warlock",
          maxSpellLevel: 7,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    {
      level: 14,
      grants: ["trait_otherworldly_patron_feature"],
      grantsASI: false,
    },
    {
      level: 15,
      grants: [
        "trait_mystic_arcanum_8",
        {
          type: "spell_choice",
          nodeId: "warlock_level_15_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_15_mystic_arcanum",
          listSource: "warlock",
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
        "trait_mystic_arcanum_9",
        {
          type: "spell_choice",
          nodeId: "warlock_level_17_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
        {
          type: "spell_choice",
          nodeId: "warlock_level_17_mystic_arcanum",
          listSource: "warlock",
          maxSpellLevel: 9,
          pickCount: 1,
        },
      ],
      grantsASI: false,
    },
    { level: 18, grants: [], grantsASI: false },
    {
      level: 19,
      grants: [
        {
          type: "spell_choice",
          nodeId: "warlock_level_19_spells_known",
          listSource: "warlock",
          maxSpellLevel: 5,
          pickCount: 1,
        },
      ],
      grantsASI: true,
    },
    {
      level: 20,
      grants: ["trait_eldritch_master"],
      grantsASI: false,
    },
  ],
};

export const WARLOCK_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_warlock_archfey: {
    id: "subclass_warlock_archfey",
    classId: "class_warlock",
    name: "The Archfey",
    progression: [
      {
        level: 1,
        grants: ["trait_archfey_expanded_spells", "trait_fey_presence"],
      },
      {
        level: 6,
        grants: ["trait_misty_escape"],
      },
      {
        level: 10,
        grants: ["trait_beguiling_defenses"],
      },
      {
        level: 14,
        grants: ["trait_dark_delirium"],
      },
    ],
  },
  subclass_warlock_fiend: {
    id: "subclass_warlock_fiend",
    classId: "class_warlock",
    name: "The Fiend",
    progression: [
      {
        level: 1,
        grants: ["trait_fiend_expanded_spells", "trait_dark_ones_blessing"],
      },
      {
        level: 6,
        grants: ["trait_dark_ones_own_luck"],
      },
      {
        level: 10,
        grants: ["trait_fiendish_resilience"],
      },
      {
        level: 14,
        grants: ["trait_hurl_through_hell"],
      },
    ],
  },
  subclass_warlock_great_old_one: {
    id: "subclass_warlock_great_old_one",
    classId: "class_warlock",
    name: "The Great Old One",
    progression: [
      {
        level: 1,
        grants: ["trait_great_old_one_expanded_spells", "trait_awakened_mind"],
      },
      {
        level: 6,
        grants: ["trait_entropic_ward"],
      },
      {
        level: 10,
        grants: ["trait_thought_shield"],
      },
      {
        level: 14,
        grants: ["trait_create_thrall"],
      },
    ],
  },
};
