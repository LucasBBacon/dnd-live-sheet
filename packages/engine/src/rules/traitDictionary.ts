import type { TraitDefinition } from "@project/shared";
import { DWARF_TRAITS } from "./traits/dwarfDictionary.js";
import { ELF_TRAITS } from "./traits/elfDictionary.js";
import { GNOME_TRAITS } from "./traits/gnomeDictionary.js";
import { HALF_ELF_TRAITS } from "./traits/halfElfDictionary.js";
import { HALF_ORC_TRAITS } from "./traits/halfOrcDictionary.js";

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
        },
      ],
      choices: [],
    },
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
        },
      ],
      choices: [],
    },
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
        },
        {
          target: "ARMOR_CLASS",
          type: "set_base",
          value: 13,
          scalingFactor: "none",
        },
      ],
      choices: [],
    },
  },
  ...DWARF_TRAITS,
  ...ELF_TRAITS,
  ...GNOME_TRAITS,
  ...HALF_ELF_TRAITS,
  ...HALF_ORC_TRAITS,
};
