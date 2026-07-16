import type { TraitDefinition } from "@project/shared";
import { DWARF_TRAITS } from "./traits/dwarfDictionary.js";

export const TRAIT_DICTIONARY: Record<string, TraitDefinition> = {
  feat_tough: {
    id: "feat_tough",
    name: "Tough",
    modifiers: [
      {
        target: "MAX_HP",
        type: "add",
        value: 2,
        scalingFactor: "total_level",
      },
    ],
  },
  feat_alert: {
    id: "feat_alert",
    name: "Alert",
    modifiers: [
      {
        target: "INITIATIVE",
        type: "add",
        value: 5,
        scalingFactor: "none",
      },
    ],
  },
  trait_draconic_resilience: {
    id: "trait_draconic_resilience",
    name: "Draconic Resilience",
    modifiers: [
      {
        target: "MAX_HP",
        type: "add",
        value: 1,
        scalingFactor: "class_level",
      },
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 13,
        scalingFactor: "none",
      },
    ],
  },
  ...DWARF_TRAITS,
};
