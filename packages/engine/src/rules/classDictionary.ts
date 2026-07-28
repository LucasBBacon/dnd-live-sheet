import type { ClassDefinition } from "@project/shared";

/**
 * Canonical class blueprints.
 *
 * A `grants` entry is either a bare trait id or a structured grant node
 * (`fixed_spell` / `spell_choice`). Trait ids referenced here are placeholders
 * until the matching entries land in the trait dictionary - only
 * `class_barbarian_rage` exists today.
 *
 * Levels that unlock a subclass or a subclass feature grant nothing directly:
 * those come from the selected subclass blueprint, not the base class.
 */
export const CLASS_DICTIONARY: Record<string, ClassDefinition> = {
  class_barbarian: {
    id: "class_barbarian",
    name: "Barbarian",
    hitDie: 12,
    subclassUnlockLevel: 3,
    startingProficiencyTraitIds: [
      "class_barbarian_armor_proficiency",
      "class_barbarian_weapon_proficiency",
      "class_barbarian_saving_throws",
      "class_barbarian_skill_proficiency",
    ],
    progression: [
      {
        level: 1,
        grants: ["class_barbarian_rage", "class_barbarian_unarmored_defense"],
        grantsASI: false,
      },
      {
        level: 2,
        grants: [
          "class_barbarian_reckless_attack",
          "class_barbarian_danger_sense",
        ],
        grantsASI: false,
      },
      // primal path selection
      { level: 3, grants: [], grantsASI: false },
      { level: 4, grants: [], grantsASI: true },
      {
        level: 5,
        grants: ["class_barbarian_extra_attack", "class_barbarian_fast_movement"],
        grantsASI: false,
      },
      // primal path feature
      { level: 6, grants: [], grantsASI: false },
      { level: 7, grants: ["class_barbarian_feral_instinct"], grantsASI: false },
      { level: 8, grants: [], grantsASI: true },
      // brutal critical scales internally (1 die at 9, 2 at 13, 3 at 17)
      {
        level: 9,
        grants: ["class_barbarian_brutal_critical"],
        grantsASI: false,
      },
      // primal path feature
      { level: 10, grants: [], grantsASI: false },
      {
        level: 11,
        grants: ["class_barbarian_relentless_rage"],
        grantsASI: false,
      },
      { level: 12, grants: [], grantsASI: true },
      { level: 13, grants: [], grantsASI: false },
      // primal path feature
      { level: 14, grants: [], grantsASI: false },
      {
        level: 15,
        grants: ["class_barbarian_persistent_rage"],
        grantsASI: false,
      },
      { level: 16, grants: [], grantsASI: true },
      { level: 17, grants: [], grantsASI: false },
      {
        level: 18,
        grants: ["class_barbarian_indomitable_might"],
        grantsASI: false,
      },
      { level: 19, grants: [], grantsASI: true },
      {
        level: 20,
        grants: ["class_barbarian_primal_champion"],
        grantsASI: false,
      },
    ],
  },

  class_wizard: {
    id: "class_wizard",
    name: "Wizard",
    hitDie: 6,
    subclassUnlockLevel: 2,
    startingProficiencyTraitIds: [
      "class_wizard_weapon_proficiency",
      "class_wizard_saving_throws",
      "class_wizard_skill_proficiency",
    ],
    // cantrips known: 3 at lvl 1, 4 at lvl 4, 5 at lvl 10.
    // spellbook: 6 first-level spells at lvl 1, then 2 more per level gained.
    progression: [
      {
        level: 1,
        grants: [
          "class_wizard_spellcasting",
          "class_wizard_arcane_recovery",
          {
            type: "spell_choice",
            nodeId: "wizard_level_1_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 3,
          },
          {
            type: "spell_choice",
            nodeId: "wizard_level_1_spellbook",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 6,
          },
        ],
        grantsASI: false,
      },
      {
        // arcane tradition selection
        level: 2,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_2_spellbook",
            listSource: "wizard",
            maxSpellLevel: 1,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 3,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_3_spellbook",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 4,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_4_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 1,
          },
          {
            type: "spell_choice",
            nodeId: "wizard_level_4_spellbook",
            listSource: "wizard",
            maxSpellLevel: 2,
            pickCount: 2,
          },
        ],
        grantsASI: true,
      },
      {
        level: 5,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_5_spellbook",
            listSource: "wizard",
            maxSpellLevel: 3,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        // arcane tradition feature
        level: 6,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_6_spellbook",
            listSource: "wizard",
            maxSpellLevel: 3,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 7,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_7_spellbook",
            listSource: "wizard",
            maxSpellLevel: 4,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 8,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_8_spellbook",
            listSource: "wizard",
            maxSpellLevel: 4,
            pickCount: 2,
          },
        ],
        grantsASI: true,
      },
      {
        level: 9,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_9_spellbook",
            listSource: "wizard",
            maxSpellLevel: 5,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        // arcane tradition feature
        level: 10,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_10_cantrips",
            listSource: "wizard",
            maxSpellLevel: 0,
            pickCount: 1,
          },
          {
            type: "spell_choice",
            nodeId: "wizard_level_10_spellbook",
            listSource: "wizard",
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
            nodeId: "wizard_level_11_spellbook",
            listSource: "wizard",
            maxSpellLevel: 6,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 12,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_12_spellbook",
            listSource: "wizard",
            maxSpellLevel: 6,
            pickCount: 2,
          },
        ],
        grantsASI: true,
      },
      {
        level: 13,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_13_spellbook",
            listSource: "wizard",
            maxSpellLevel: 7,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        // arcane tradition feature
        level: 14,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_14_spellbook",
            listSource: "wizard",
            maxSpellLevel: 7,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 15,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_15_spellbook",
            listSource: "wizard",
            maxSpellLevel: 8,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 16,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_16_spellbook",
            listSource: "wizard",
            maxSpellLevel: 8,
            pickCount: 2,
          },
        ],
        grantsASI: true,
      },
      {
        level: 17,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_17_spellbook",
            listSource: "wizard",
            maxSpellLevel: 9,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 18,
        grants: [
          "class_wizard_spell_mastery",
          {
            type: "spell_choice",
            nodeId: "wizard_level_18_spellbook",
            listSource: "wizard",
            maxSpellLevel: 9,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
      {
        level: 19,
        grants: [
          {
            type: "spell_choice",
            nodeId: "wizard_level_19_spellbook",
            listSource: "wizard",
            maxSpellLevel: 9,
            pickCount: 2,
          },
        ],
        grantsASI: true,
      },
      {
        level: 20,
        grants: [
          "class_wizard_signature_spells",
          {
            type: "spell_choice",
            nodeId: "wizard_level_20_spellbook",
            listSource: "wizard",
            maxSpellLevel: 9,
            pickCount: 2,
          },
        ],
        grantsASI: false,
      },
    ],
  },
};

export const resolveClassDefinition = (
  classId: string,
): ClassDefinition | undefined => CLASS_DICTIONARY[classId];
