import type { ClassDefinition } from "@project/shared";
import type { SubclassDefinition } from "../subclassDictionary.js";

export const WIZARD_CLASS: ClassDefinition = {
  id: "class_wizard",
  name: "Wizard",
  hitDie: 6,
  subclassUnlockLevel: 2,
  multiclassTraitIds: [],
  multiclassPrerequisites: { abilityMinimums: { int: 13 } },
  startingProficiencyTraitIds: [
    "trait_wizard_prof_saving_throw",
    "trait_wizard_prof_weapons",
    "trait_wizard_prof_skills",
  ],
  progression: [
    {
      level: 1,
      grants: [
        "trait_spellcasting_wizard",
        "trait_arcane_recovery",
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
      level: 2,
      grants: [
        "trait_arcane_tradition",
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
      level: 6,
      grants: [
        "trait_arcane_tradition_feature",
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
      level: 10,
      grants: [
        "trait_arcane_tradition_feature",
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
      level: 14,
      grants: [
        "trait_arcane_tradition_feature",
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
        "trait_spell_mastery",
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
        "trait_signature_spell",
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
};

export const WIZARD_SUBCLASSES: Record<string, SubclassDefinition> = {
  subclass_wizard_abjuration: {
    id: "subclass_wizard_abjuration",
    classId: "class_wizard",
    name: "School of Abjuration",
    progression: [
      {
        level: 2,
        grants: ["trait_abjuration_savant", "trait_arcane_ward"],
      },
      {
        level: 6,
        grants: ["trait_projected_ward"],
      },
      {
        level: 10,
        grants: ["trait_improved_abjuration"],
      },
      {
        level: 14,
        grants: ["trait_spell_resistance"],
      },
    ],
  },
  subclass_wizard_conjuration: {
    id: "subclass_wizard_conjuration",
    classId: "class_wizard",
    name: "School of Conjuration",
    progression: [
      {
        level: 2,
        grants: ["trait_conjuration_savant", "trait_minor_conjuration"],
      },
      {
        level: 6,
        grants: ["trait_benign_transposition"],
      },
      {
        level: 10,
        grants: ["trait_focused_conjuration"],
      },
      {
        level: 14,
        grants: ["trait_durable_summons"],
      },
    ],
  },
  subclass_wizard_divination: {
    id: "subclass_wizard_divination",
    classId: "class_wizard",
    name: "School of Divination",
    progression: [
      {
        level: 2,
        grants: ["trait_divination_savant", "trait_portent"],
      },
      {
        level: 6,
        grants: ["trait_expert_divination"],
      },
      {
        level: 10,
        grants: ["trait_the_third_eye"],
      },
      {
        level: 14,
        grants: ["trait_greater_portent"],
      },
    ],
  },
  subclass_wizard_enchantment: {
    id: "subclass_wizard_enchantment",
    classId: "class_wizard",
    name: "School of Enchantment",
    progression: [
      {
        level: 2,
        grants: ["trait_enchantment_savant", "trait_hypnotic_gaze"],
      },
      {
        level: 6,
        grants: ["trait_instinctive_charm"],
      },
      {
        level: 10,
        grants: ["trait_split_enchantment"],
      },
      {
        level: 14,
        grants: ["trait_alter_memories"],
      },
    ],
  },
  subclass_wizard_evocation: {
    id: "subclass_wizard_evocation",
    classId: "class_wizard",
    name: "School of Evocation",
    progression: [
      {
        level: 2,
        grants: ["trait_evocation_savant", "trait_sculpt_spells"],
      },
      {
        level: 6,
        grants: ["trait_potent_cantrip"],
      },
      {
        level: 10,
        grants: ["trait_empowered_evocation"],
      },
      {
        level: 14,
        grants: ["trait_overchannel"],
      },
    ],
  },
  subclass_wizard_illusion: {
    id: "subclass_wizard_illusion",
    classId: "class_wizard",
    name: "School of Illusion",
    progression: [
      {
        level: 2,
        grants: ["trait_illusion_savant", "trait_improved_minor_illusion"],
      },
      {
        level: 6,
        grants: ["trait_malleable_illusions"],
      },
      {
        level: 10,
        grants: ["trait_illusory_self"],
      },
      {
        level: 14,
        grants: ["trait_illusory_reality"],
      },
    ],
  },
  subclass_wizard_necromancy: {
    id: "subclass_wizard_necromancy",
    classId: "class_wizard",
    name: "School of Necromancy",
    progression: [
      {
        level: 2,
        grants: ["trait_necromancy_savant", "trait_grim_harvest"],
      },
      {
        level: 6,
        grants: ["trait_undead_thralls"],
      },
      {
        level: 10,
        grants: ["trait_inured_to_undeath"],
      },
      {
        level: 14,
        grants: ["trait_command_undead"],
      },
    ],
  },
  subclass_wizard_transmutation: {
    id: "subclass_wizard_transmutation",
    classId: "class_wizard",
    name: "School of Transmutation",
    progression: [
      {
        level: 2,
        grants: ["trait_transmutation_savant", "trait_minor_alchemy"],
      },
      {
        level: 6,
        grants: ["trait_transmuters_stone"],
      },
      {
        level: 10,
        grants: ["trait_shapechanger"],
      },
      {
        level: 14,
        grants: ["trait_master_transmuter"],
      },
    ],
  },
};
