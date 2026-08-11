import type { FeatPrerequisites } from "@project/shared";

export interface FeatDefinition {
  id: string;
  name: string;
  category: string;
  source: string;
  repeatable: boolean;
  prerequisites?: FeatPrerequisites;
  grantedTraitIds: string[];
  lore: {
    shortDescription: string;
    fullText?: string;
  };
  tags?: string[];
}

/**
 * Feats are first-class catalogue records, not traits.
 *
 * A feat can grant one or many traits, and those trait ids carry the mechanical
 * runtime payload. Keeping feats separate avoids coupling feature identity to
 * implementation details in the trait system.
 */
export const FEAT_DICTIONARY: Record<string, FeatDefinition> = {
  feat_alert: {
    id: "feat_alert",
    name: "Alert",
    category: "general",
    source: "phb",
    repeatable: false,
    grantedTraitIds: ["feat_alert"],
    lore: {
      shortDescription: "You gain a +5 bonus to initiative.",
    },
    tags: ["initiative"],
  },
  feat_tough: {
    id: "feat_tough",
    name: "Tough",
    category: "general",
    source: "phb",
    repeatable: false,
    grantedTraitIds: ["feat_tough"],
    lore: {
      shortDescription:
        "Your hit point maximum increases by an amount that scales with your total level.",
    },
    tags: ["durability", "max_hp"],
  },
  feat_mobile: {
    id: "feat_mobile",
    name: "Mobile",
    category: "general",
    source: "phb",
    repeatable: false,
    grantedTraitIds: ["trait_feat_mobile"],
    lore: {
      shortDescription: "Your speed increases and you are harder to pin down.",
    },
    tags: ["speed"],
  },
  feat_skilled: {
    id: "feat_skilled",
    name: "Skilled",
    category: "general",
    source: "phb",
    repeatable: false,
    grantedTraitIds: ["trait_feat_skilled"],
    lore: {
      shortDescription:
        "Gain proficiency in any combination of three skills of your choice.",
    },
    tags: ["skills"],
  },
};

export const resolveFeatDefinition = (
  featId: string,
): FeatDefinition | undefined => FEAT_DICTIONARY[featId];

export const resolveFeatGrantedTraitIds = (featId: string): string[] => {
  const feat = FEAT_DICTIONARY[featId];
  return feat?.grantedTraitIds ?? [];
};
