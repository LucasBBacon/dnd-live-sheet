import type { LevelUpPayload } from "@project/shared";
import {
  getEffectiveReferenceSnapshot,
  type EffectiveReferenceSnapshot,
  type ReferenceScope,
} from "./effectiveReferenceResolver.js";

export type ResolverDecisionType =
  | "subclass"
  | "asi_or_feat"
  | "trait_selection"
  | "spell_selection";

export type ResolverDecision = {
  id: string;
  type: ResolverDecisionType;
  description: string;
  options?: string[];
  isRequired: boolean;
  quantity?: number;
};

export type ResolverNextLevelContext = {
  targetLevel: number;
  isConfigured: boolean;
  reason: string | null;
  grantedTraitIds: string[];
  decisionTypes: Array<"subclass" | "asi_or_feat">;
  decisions: ResolverDecision[];
};

type ChoiceLike = {
  count?: number;
  pool?: unknown;
};

type TraitEffectLike = {
  type?: string;
  choice?: ChoiceLike;
};

const asStringOptions = (pool: unknown): string[] | undefined => {
  if (!Array.isArray(pool)) {
    return undefined;
  }

  const values = pool.filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : undefined;
};

const getGrantedFeaturesForLevel = ({
  cache,
  classId,
  targetLevel,
  requestedSubclassId,
}: {
  cache: EffectiveReferenceSnapshot;
  classId: string;
  targetLevel: number;
  requestedSubclassId: string | undefined;
}) => {
  const classFeatures =
    cache.classTraitsByClassLevel.get(`${classId}::${targetLevel}`) ?? [];

  let subclassFeatures: typeof classFeatures = [];

  if (requestedSubclassId) {
    const validSubclass = cache.subclassById.get(requestedSubclassId);
    const isValidSubclass = validSubclass?.parentClassId === classId;

    if (isValidSubclass) {
      subclassFeatures =
        cache.subclassTraitsBySubclassLevel.get(
          `${requestedSubclassId}::${targetLevel}`,
        ) ?? [];
    }
  }

  return [...classFeatures, ...subclassFeatures];
};

const extractTraitDrivenDecisions = (
  grantedFeatures: Array<{ id: string; name: string; effects: unknown }>,
): ResolverDecision[] => {
  const decisions: ResolverDecision[] = [];

  for (const trait of grantedFeatures) {
    if (!Array.isArray(trait.effects)) {
      continue;
    }

    trait.effects.forEach((effect, effectIndex) => {
      if (!effect || typeof effect !== "object") {
        return;
      }

      const typedEffect = effect as TraitEffectLike;

      if (typedEffect.type === "proficiency_choice") {
        decisions.push({
          id: `dec_${trait.id}_prof_choice_${effectIndex}`,
          type: "trait_selection",
          description: `Choose proficiencies for ${trait.name}.`,
          options: asStringOptions(typedEffect.choice?.pool),
          isRequired: true,
          quantity: typedEffect.choice?.count ?? 1,
        });
        return;
      }

      if (typedEffect.type === "spell_grant" && typedEffect.choice) {
        decisions.push({
          id: `dec_${trait.id}_spell_choice_${effectIndex}`,
          type: "spell_selection",
          description: `Choose spells granted by ${trait.name}.`,
          options: asStringOptions(typedEffect.choice.pool),
          isRequired: true,
          quantity: typedEffect.choice.count ?? 1,
        });
      }
    });
  }

  return decisions;
};

const getSelectedTraitsForDecision = (
  payload: LevelUpPayload,
  decisionId: string,
): string[] => {
  const selectedTraits = payload.selectedTraits as unknown;

  if (!selectedTraits) {
    return [];
  }

  if (Array.isArray(selectedTraits)) {
    return selectedTraits.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof selectedTraits === "object") {
    const selectedByDecision = selectedTraits as Record<string, unknown>;
    const exact = selectedByDecision[decisionId];

    if (Array.isArray(exact)) {
      return exact.filter((entry): entry is string => typeof entry === "string");
    }

    return Object.values(selectedByDecision)
      .flatMap((entry) => (Array.isArray(entry) ? entry : []))
      .filter((entry): entry is string => typeof entry === "string");
  }

  return [];
};

export const resolveNextLevelValidationContext = async ({
  scope,
  classId,
  currentClassLevel,
  requestedSubclassId,
}: {
  scope: ReferenceScope;
  classId: string;
  currentClassLevel: number;
  requestedSubclassId?: string;
}): Promise<ResolverNextLevelContext> => {
  const cache = await getEffectiveReferenceSnapshot(scope);
  return resolveNextLevelValidationContextFromSnapshot({
    cache,
    classId,
    currentClassLevel,
    requestedSubclassId,
  });
};

export const resolveNextLevelValidationContextFromSnapshot = ({
  cache,
  classId,
  currentClassLevel,
  requestedSubclassId,
}: {
  cache: EffectiveReferenceSnapshot;
  classId: string;
  currentClassLevel: number;
  requestedSubclassId?: string;
}): ResolverNextLevelContext => {
  const targetLevel = currentClassLevel + 1;
  const classDefinition = cache.classes.find((row) => row.id === classId);
  const levelMeta = (cache.classLevelsByClassId.get(classId) ?? []).find(
    (row) => row.level === targetLevel,
  );

  const grantedFeatures = getGrantedFeaturesForLevel({
    cache,
    classId,
    targetLevel,
    requestedSubclassId,
  });

  const grantedTraitIds = grantedFeatures.map((feature) => feature.id);
  const decisionTypes: Array<"subclass" | "asi_or_feat"> = [];
  const decisions: ResolverDecision[] = [];

  if (classDefinition?.subclassRequirementLevel === targetLevel) {
    decisionTypes.push("subclass");
    decisions.push({
      id: `dec_${classId}_subclass_${targetLevel}`,
      type: "subclass",
      description: "Choose a subclass for this class level.",
      options: (cache.subclassesByClassId.get(classId) ?? []).map(
        (subclass) => subclass.id,
      ),
      isRequired: true,
      quantity: 1,
    });
  }

  if (grantedTraitIds.includes("trait_ability_score_improvement")) {
    decisionTypes.push("asi_or_feat");
    decisions.push({
      id: `dec_${classId}_asi_or_feat_${targetLevel}`,
      type: "asi_or_feat",
      description: "Increase one ability score by 2, or two by 1, or choose a feat.",
      isRequired: true,
      quantity: 1,
    });
  }

  decisions.push(...extractTraitDrivenDecisions(grantedFeatures));

  if (!levelMeta) {
    return {
      targetLevel,
      isConfigured: false,
      reason: `Level ${targetLevel} is not configured in class progression data.`,
      grantedTraitIds: [],
      decisionTypes: [],
      decisions: [],
    };
  }

  return {
    targetLevel,
    isConfigured: true,
    reason: null,
    grantedTraitIds,
    decisionTypes,
    decisions,
  };
};

export const validateLevelUpPayloadFromResolver = ({
  payload,
  context,
}: {
  payload: LevelUpPayload;
  context: ResolverNextLevelContext;
}): void => {
  if (!context.isConfigured) {
    throw new Error(
      context.reason ||
        `Level-up progression for ${payload.targetClassId} level ${context.targetLevel} is not configured yet.`,
    );
  }

  for (const decision of context.decisions) {
    if (!decision.isRequired) {
      continue;
    }

    if (decision.type === "subclass" && !payload.subclassId) {
      throw new Error("A subclass selection is required at this level");
    }

    if (decision.type === "asi_or_feat") {
      const hasASI = Boolean(payload.asiChoices && payload.asiChoices.length > 0);
      const hasFeat = Boolean(payload.featId);

      if (!hasASI && !hasFeat) {
        throw new Error(
          "You must allocate Ability Score Improvements or select a Feat.",
        );
      }

      if (hasASI && hasFeat) {
        throw new Error(
          "You cannot select both Ability Score Improvements and a Feat",
        );
      }
    }

    if (decision.type === "trait_selection") {
      const selectedTraits = getSelectedTraitsForDecision(payload, decision.id);
      const expected = decision.quantity ?? 1;

      if (selectedTraits.length !== expected) {
        throw new Error(
          `You must select exactly ${expected} option(s) for ${decision.description}.`,
        );
      }
    }

    if (decision.type === "spell_selection") {
      const selectedSpells = payload.addedSpells ?? [];
      const expected = decision.quantity ?? 1;

      if (selectedSpells.length < expected) {
        throw new Error(
          `You must select exactly ${expected} spell option(s) for ${decision.description}.`,
        );
      }
    }
  }
};
