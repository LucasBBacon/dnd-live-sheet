import type { Modifier, ModifierTarget } from "../types/engine.js";

export interface TraitModifier {
  target: ModifierTarget;
  type: "flat" | "multiplier" | "override";
  value: number;
  scalingFactor?: "total_level" | "class_level";
}

export interface TraitDefinition {
  id: string;
  name: string;
  modifiers: TraitModifier[];
}

export const TRAIT_DICTIONARY: Record<string, TraitDefinition> = {
  feat_tough: {
    id: "feat_tough",
    name: "Tough",
    modifiers: [
      {
        target: "MAX_HP",
        type: "flat",
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
        type: "flat",
        value: 5,
      },
    ],
  },
  trait_draconic_resilience: {
    id: "trait_draconic_resilience",
    name: "Draconic Resilience",
    modifiers: [
      {
        target: "MAX_HP",
        type: "flat",
        value: 1,
        scalingFactor: "class_level",
      },
      {
        target: "ARMOR_CLASS",
        type: "override",
        value: 13,
      },
    ],
  },
};
