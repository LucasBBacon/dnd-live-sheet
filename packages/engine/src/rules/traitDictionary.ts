import type { TraitDefinition } from "@project/shared";
import { DWARF_TRAITS } from "./traits/dwarfDictionary.js";
import { ELF_TRAITS } from "./traits/elfDictionary.js";
import { GNOME_TRAITS } from "./traits/gnomeDictionary.js";
import { HALF_ELF_TRAITS } from "./traits/halfElfDictionary.js";
import { HALF_ORC_TRAITS } from "./traits/halfOrcDictionary.js";
import { DRAGONBORN_TRAITS } from "./traits/dragonbornDictionary.js";
import { HALFLING_TRAITS } from "./traits/halflingDictionary.js";
import { HUMAN_TRAITS } from "./traits/humanDictionary.js";
import { TIEFLING_TRAITS } from "./traits/tieflingDictionary.js";
import { SUBCLASS_SPELL_TRAITS } from "./traits/subclassSpellDictionary.js";
import { FIGHTING_STYLE_TRAITS } from "./traits/fightingStyleDictionary.js";
import { METAMAGIC_TRAITS } from "./traits/metamagicDictionary.js";
import { WARLOCK_OPTION_TRAITS } from "./traits/warlockOptionDictionary.js";
import { TOTEM_TRAITS } from "./traits/totemDictionary.js";
import { ELEMENTAL_DISCIPLINE_TRAITS } from "./traits/elementalDisciplineDictionary.js";
import { HUNTER_OPTION_TRAITS } from "./traits/hunterOptionDictionary.js";
import { DRACONIC_ANCESTRY_TRAITS } from "./traits/draconicAncestryDictionary.js";
import { MANEUVER_TRAITS } from "./traits/maneuverDictionary.js";

export const TRAIT_DICTIONARY: Record<string, TraitDefinition> = {
  feat_tough: {
    id: "feat_tough",
    name: "Tough",
    description: "",
    modifiers: {
      fixed: [
        {
          target: "MAX_HP",
          type: "add",
          value: 2,
          scalingFactor: "total_level",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  feat_alert: {
    id: "feat_alert",
    name: "Alert",
    description: "",
    modifiers: {
      fixed: [
        {
          target: "INITIATIVE",
          type: "add",
          value: 5,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_powerful_build: {
    id: "trait_powerful_build",
    name: "Powerful Build",
    description:
      "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
    modifiers: { fixed: [], choices: [] },
    // the whole trait is this flag: EncumbranceEngine reads the capacity table
    // one row down when it is set. no race grants it yet - it is here for the
    // goliath-shaped hole in RACE_DICTIONARY
    grantedStates: ["powerful_build"],
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  trait_draconic_resilience: {
    id: "trait_draconic_resilience",
    name: "Draconic Resilience",
    description: "",
    modifiers: {
      fixed: [
        {
          target: "MAX_HP",
          type: "add",
          value: 1,
          scalingFactor: "class_level",
          requiredStates: [],
          forbiddenStates: [],
        },
        {
          target: "ARMOR_CLASS",
          type: "set_base",
          value: 13,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  class_barbarian_rage: {
    id: "class_barbarian_rage",
    name: "Rage",
    description:
      "While raging, you have resistance to bludgeoning, piercing, and slashing damage.",
    modifiers: {
      fixed: [
        {
          target: "DAMAGE_BONUS",
          type: "add",
          value: 2,
          scalingFactor: "class_level",
          requiredStates: [
            "status_raging",
            "action_melee_attack",
            "action_using_str",
          ],
          forbiddenStates: [],
        },
      ],
      choices: [],
    },
    affinities: {
      fixed: [
        {
          damageType: "bludgeoning",
          level: "resistance",
          bypassedBy: [],
          requiredStates: ["status_raging"],
        },
        {
          damageType: "piercing",
          level: "resistance",
          bypassedBy: [],
          requiredStates: ["status_raging"],
        },
        {
          damageType: "slashing",
          level: "resistance",
          bypassedBy: [],
          requiredStates: ["status_raging"],
        },
      ],
      choices: [],
    },
    resources: [],
    triggers: [],
    diceRules: [],
    criticalHitModifiers: [],
    actions: [],
  },
  ...DRAGONBORN_TRAITS,
  ...DWARF_TRAITS,
  ...ELF_TRAITS,
  ...GNOME_TRAITS,
  ...HALF_ELF_TRAITS,
  ...HALF_ORC_TRAITS,
  ...HALFLING_TRAITS,
  ...HUMAN_TRAITS,
  ...TIEFLING_TRAITS,
  ...SUBCLASS_SPELL_TRAITS,
  ...FIGHTING_STYLE_TRAITS,
  ...METAMAGIC_TRAITS,
  ...WARLOCK_OPTION_TRAITS,
  ...TOTEM_TRAITS,
  ...ELEMENTAL_DISCIPLINE_TRAITS,
  ...HUNTER_OPTION_TRAITS,
  ...DRACONIC_ANCESTRY_TRAITS,
  ...MANEUVER_TRAITS,
};
