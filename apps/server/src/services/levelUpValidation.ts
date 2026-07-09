import type { LevelUpPayload } from "@project/shared";
import {
  getEffectiveReferenceSnapshot,
  type EffectiveReferenceSnapshot,
  type ReferenceScope,
} from "./effectiveReferenceResolver.js";

// #region Type Definitions

/**
 * Defines the types of decisions that can be made during the level-up process:
 * subclass selection, ability score improvement or feat selection, trait selection, and spell selection.
 */
export type ResolverDecisionType =
  | "subclass"
  | "asi_or_feat"
  | "trait_selection"
  | "spell_selection";

/**
 * Represents a decision that needs to be made during the level-up process, including its type, description, and any associated options or requirements.
 */
export type ResolverDecision = {
  id: string;
  type: ResolverDecisionType;
  description: string;
  options?: string[];
  isRequired: boolean;
  quantity?: number;
};

/**
 * Represents the context for resolving the next level of a character's class progression, including the target level, whether the level is configured, any reasons for configuration issues, granted trait IDs, decision types, and specific decisions that need to be made.
 */
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

/**
 * Represents an effect associated with a trait,
 * which may include a type and an optional choice object that defines the number of selections and the pool of options available for that effect.
 */
type TraitEffectLike = {
  type?: string;
  choice?: ChoiceLike;
};

// #endregion

// #region Internal Helper Functions

/**
 * Converts a pool of unknown values into an array of strings, filtering out any non-string entries.
 * @param pool The pool of unknown values to be converted into strings.
 * @returns An array of strings extracted from the pool, or undefined if the pool is not an array or contains no string entries.
 */
const asStringOptions = (pool: unknown): string[] | undefined => {
  if (!Array.isArray(pool)) {
    return undefined;
  }

  const values = pool.filter(
    (entry): entry is string => typeof entry === "string",
  );
  return values.length > 0 ? values : undefined;
};

/**
 * Retrieves the granted features (traits) for a specific class and level, including any subclass features if applicable.
 * @param param0 An object containing the effective reference snapshot, class ID, target level, and optional requested subclass ID.
 * @returns An array of granted features (traits) for the specified class and level, including subclass features if applicable.
 */
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
  // retrieve class features for class + level from cache
  const classFeatures =
    cache.classTraitsByClassLevel.get(`${classId}::${targetLevel}`) ?? [];

  // retrieve subclass features for subclass + level from cache if a valid subclass is provided
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

/**
 * Extracts decisions that are driven by granted features (traits) during the level-up process, such as proficiency choices and spell grants.
 * @param grantedFeatures An array of granted features (traits) that may contain effects requiring decisions to be made.
 * @returns An array of decisions that need to be made based on the granted features, including proficiency choices and spell grants.
 */
const extractTraitDrivenDecisions = (
  grantedFeatures: Array<{ id: string; name: string; effects: unknown }>,
): ResolverDecision[] => {
  const decisions: ResolverDecision[] = [];

  for (const trait of grantedFeatures) {
    // skip if no effects array
    if (!Array.isArray(trait.effects)) {
      continue;
    }

    // iterate over effects
    trait.effects.forEach((effect, effectIndex) => {
      // skip if effect is not an object
      if (!effect || typeof effect !== "object") {
        return;
      }

      // cast effect to TraitEffectLike for type safety
      const typedEffect = effect as TraitEffectLike;

      // handle proficiency choice effects by creating a decision for trait selection
      if (typedEffect.type === "proficiency_choice") {
        decisions.push({
          id: `dec_${trait.id}_prof_choice_${effectIndex}`,
          type: "trait_selection",
          description: `Choose proficiencies for ${trait.name}.`,
          options: asStringOptions(typedEffect.choice?.pool) ?? [],
          isRequired: true,
          quantity: typedEffect.choice?.count ?? 1,
        });
        return;
      }

      // handle spell grant effects by creating a decision for spell selection
      if (typedEffect.type === "spell_grant" && typedEffect.choice) {
        decisions.push({
          id: `dec_${trait.id}_spell_choice_${effectIndex}`,
          type: "spell_selection",
          description: `Choose spells granted by ${trait.name}.`,
          options: asStringOptions(typedEffect.choice.pool) ?? [],
          isRequired: true,
          quantity: typedEffect.choice.count ?? 1,
        });
      }
    });
  }

  return decisions;
};

/**
 * Retrieves the selected traits for a specific decision from the level-up payload, handling different structures of the selectedTraits property (array or object).
 * @param payload The level-up payload containing the selected traits.
 * @param decisionId The ID of the decision for which to retrieve the selected traits.
 * @returns An array of selected trait IDs for the specified decision, or an empty array if no traits are selected.
 */
const getSelectedTraitsForDecision = (
  payload: LevelUpPayload,
  decisionId: string,
): string[] => {
  const selectedTraits = payload.selectedTraits as unknown;

  // if no traits are selected, return an empty array
  if (!selectedTraits) {
    return [];
  }

  // handle case where selectedTraits is an array of strings
  if (Array.isArray(selectedTraits)) {
    return selectedTraits.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }

  // handle case where selectedTraits is an object mapping decision IDs to arrays of strings
  if (typeof selectedTraits === "object") {
    // cast selectedTraits to a record of decision IDs to unknown values for type safety
    // filter and return only the selected traits for the specified decision ID
    const selectedByDecision = selectedTraits as Record<string, unknown>;
    const exact = selectedByDecision[decisionId];

    // if exact is an array, filter and return only the string entries
    if (Array.isArray(exact)) {
      return exact.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }

    return Object.values(selectedByDecision)
      .flatMap((entry) => (Array.isArray(entry) ? entry : []))
      .filter((entry): entry is string => typeof entry === "string");
  }

  return [];
};

// #endregion

// #region Public API

/**
 * Resolves the next level validation context for a character's class progression based on the provided reference scope, class ID, current class level, and optional requested subclass ID.
 * @param param0 An object containing the reference scope, class ID, current class level, and optional requested subclass ID.
 * @returns A promise that resolves to the next level validation context, including the target level, granted trait IDs, and any decisions that need to be made during the level-up process.
 */
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
    ...(requestedSubclassId !== undefined ? { requestedSubclassId } : {}),
  });
};

/**
 * Builds the next level context for a character's class progression, including the target level and granted traits at that level.
 * @param param0 An object containing the effective reference snapshot, class ID, current class level, and optional requested subclass ID.
 * @returns An object representing the next level context, including the target level and an array of granted trait IDs at that level.
 */
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
  // determine target level, class definition, and level metadata for next class progression step
  const targetLevel = currentClassLevel + 1;
  const classDefinition = cache.classes.find((row) => row.id === classId);
  const levelMeta = (cache.classLevelsByClassId.get(classId) ?? []).find(
    (row) => row.level === targetLevel,
  );

  // retrieve granted features for target level (including any subclass features if applicable)
  const grantedFeatures = getGrantedFeaturesForLevel({
    cache,
    classId,
    targetLevel,
    requestedSubclassId,
  });

  // extract granted trait IDs and build decision types and decisions based on granted features
  const grantedTraitIds = grantedFeatures.map((feature) => feature.id);
  const decisionTypes: Array<"subclass" | "asi_or_feat"> = [];
  const decisions: ResolverDecision[] = [];

  // determine if subclass selection is required at this level
  // add corresponding decision if applicable
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

  // determine if ability score improvement/feat selection is granted at this level
  // add corresponding decision if applicable
  if (grantedTraitIds.includes("trait_ability_score_improvement")) {
    decisionTypes.push("asi_or_feat");
    decisions.push({
      id: `dec_${classId}_asi_or_feat_${targetLevel}`,
      type: "asi_or_feat",
      description:
        "Increase one ability score by 2, or two by 1, or choose a feat.",
      isRequired: true,
      quantity: 1,
    });
  }

  // extract any additional trait-driven decisions based on granted features and append to decisions array
  decisions.push(...extractTraitDrivenDecisions(grantedFeatures));

  // if no level metadata, return context indicating that level is not configured
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

  // return context indicating that level is configured, along with granted trait IDs and decisions
  return {
    targetLevel,
    isConfigured: true,
    reason: null,
    grantedTraitIds,
    decisionTypes,
    decisions,
  };
};

/**
 * Validates the level-up payload against the resolved next level context,
 * ensuring that all required decisions have been made and that the selections meet the specified requirements.
 * @param param0 An object containing the level-up payload and the resolved next level context.
 * @throws Will throw an error if any required decisions are missing or if the selections do not meet the specified requirements.
 */
export const validateLevelUpPayloadFromResolver = ({
  payload,
  context,
}: {
  payload: LevelUpPayload;
  context: ResolverNextLevelContext;
}): void => {
  // if the level is not configured, throw an error with the provided reason or a default message
  if (!context.isConfigured) {
    throw new Error(
      context.reason ||
        `Level-up progression for ${payload.targetClassId} level ${context.targetLevel} is not configured yet.`,
    );
  }

  for (const decision of context.decisions) {
    // skip validation for non-required decisions
    if (!decision.isRequired) {
      continue;
    }

    // strict validation: subclass selection
    if (decision.type === "subclass" && !payload.subclassId) {
      throw new Error("A subclass selection is required at this level");
    }

    // strict validation: ability score improvement or feat selection
    if (decision.type === "asi_or_feat") {
      const hasASI = Boolean(
        payload.asiChoices && payload.asiChoices.length > 0,
      );
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

    // strict validation: trait selection
    if (decision.type === "trait_selection") {
      const selectedTraits = getSelectedTraitsForDecision(payload, decision.id);
      const expected = decision.quantity ?? 1;

      if (selectedTraits.length !== expected) {
        throw new Error(
          `You must select exactly ${expected} option(s) for ${decision.description}.`,
        );
      }
    }

    // strict validation: spell selection
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

// #endregion
