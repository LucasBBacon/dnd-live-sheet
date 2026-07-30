import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const ROGUE_CLASS: ClassDefinition = {
  id: "class_rogue",
  name: "Rogue",
  hitDie: 8,
  subclassUnlockLevel: 3,
  startingProficiencyTraitIds: [
    "trait_rogue_prof_saving_throw",
    "trait_rogue_prof_armor",
    "trait_rogue_prof_weapons",
    "trait_rogue_prof_tools",
    "trait_rogue_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: ["trait_expertise", "trait_sneak_attack", "trait_thieves_cant"],
      grantsASI: false,
    },
    {
      level: 2,
      grants: ["trait_cunning_action"],
      grantsASI: false,
    },
    {
      level: 3,
      grants: ["trait_roguish_archetype"],
      grantsASI: false,
    },
    { level: 4, grants: [], grantsASI: true },
    {
      level: 5,
      grants: ["trait_uncanny_dodge"],
      grantsASI: false,
    },
    {
      level: 6,
      grants: ["trait_expertise"],
      grantsASI: false,
    },
    {
      level: 7,
      grants: ["trait_evasion_rogue"],
      grantsASI: false,
    },
    { level: 8, grants: [], grantsASI: true },
    {
      level: 9,
      grants: ["trait_roguish_archetype_feature"],
      grantsASI: false,
    },
    { level: 10, grants: [], grantsASI: true },
    {
      level: 11,
      grants: ["trait_reliable_talent"],
      grantsASI: false,
    },
    { level: 12, grants: [], grantsASI: true },
    {
      level: 13,
      grants: ["trait_roguish_archetype_feature"],
      grantsASI: false,
    },
    {
      level: 14,
      grants: ["trait_blindsense"],
      grantsASI: false,
    },
    {
      level: 15,
      grants: ["trait_slippery_mind"],
      grantsASI: false,
    },
    { level: 16, grants: [], grantsASI: true },
    {
      level: 17,
      grants: ["trait_roguish_archetype_feature"],
      grantsASI: false,
    },
    {
      level: 18,
      grants: ["trait_elusive"],
      grantsASI: false,
    },
    { level: 19, grants: [], grantsASI: true },
    {
      level: 20,
      grants: ["trait_stroke_of_luck"],
      grantsASI: false,
    },
  ],
};

export const ROGUE_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_rogue_arcane_trickster: {
    id: "subclass_rogue_arcane_trickster",
    classId: "class_rogue",
    name: "Arcane Trickster",
    progression: [
      {
        level: 3,
        grants: [
          "trait_rogue_arcane_trickster_spellcasting",
          "trait_mage_hand_legerdemain",
          {
            type: "spell_choice",
            nodeId: "arcane_trickster_level_3_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 3,
          },
          {
            type: "spell_choice",
            nodeId: "arcane_trickster_level_3_spells_known",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 3,
          },
        ],
      },
      {
        level: 9,
        grants: ["trait_magical_ambush"],
      },
      {
        level: 13,
        grants: [
          "trait_versatile_trickster",
          {
            type: "spell_choice",
            nodeId: "arcane_trickster_level_13_spells_known",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 1,
          },
        ],
      },
      {
        level: 17,
        grants: ["trait_spell_thief"],
      },
    ],
  },
  subclass_rogue_assassin: {
    id: "subclass_rogue_assassin",
    classId: "class_rogue",
    name: "Assassin",
    progression: [
      {
        level: 3,
        grants: ["trait_rogue_assassin_bonus_prof", "trait_assassinate"],
      },
      {
        level: 9,
        grants: ["trait_infiltration_expertise"],
      },
      {
        level: 13,
        grants: ["trait_impostor"],
      },
      {
        level: 17,
        grants: ["trait_death_strike"],
      },
    ],
  },
  subclass_rogue_thief: {
    id: "subclass_rogue_thief",
    classId: "class_rogue",
    name: "Thief",
    progression: [
      {
        level: 3,
        grants: ["trait_fast_hands", "trait_second_story_work"],
      },
      {
        level: 9,
        grants: ["trait_supreme_sneak"],
      },
      {
        level: 13,
        grants: ["trait_use_magic_device"],
      },
      {
        level: 17,
        grants: ["trait_thiefs_reflexes"],
      },
    ],
  },
};
