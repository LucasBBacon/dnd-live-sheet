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
};
