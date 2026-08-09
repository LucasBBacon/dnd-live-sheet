import type {
  ClassDefinition,
  ClassMulticlassPrerequisites,
  FeatureGrant,
  LevelUpPayload,
  TraitDefinition,
} from "@project/shared";
import { traitIdOfOption } from "@project/shared";
import {
  CLASS_DICTIONARY,
  SUBCLASS_DICTIONARY,
  TRAIT_DICTIONARY,
  listSubclassesForClass,
} from "@project/engine";

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
 *
 * For decisions that come from a progression node, `id` is that node's nodeId,
 * which is also the key the answer is stored under in
 * CharacterClassState.selections. The level-up UI and the save therefore agree
 * on one identifier.
 */
export type ResolverDecision = {
  id: string;
  type: ResolverDecisionType;
  description: string;
  options?: string[];
  isRequired: boolean;
  quantity?: number;
};

export type GrantSourceType =
  | "multiclass_grant"
  | "class_progression"
  | "subclass_progression";

export type ResolvedGrantedTrait = {
  id: string;
  name: string;
  grantSourceType: GrantSourceType;
};

/**
 * Represents the context for resolving the next level of a character's class progression, including the target level, whether the level is configured, any reasons for configuration issues, granted trait IDs, decision types, and specific decisions that need to be made.
 */
export type ResolverNextLevelContext = {
  targetLevel: number;
  isConfigured: boolean;
  reason: string | null;
  grantedTraitIds: string[];
  grantedTraits: ResolvedGrantedTrait[];
  decisionTypes: Array<"subclass" | "asi_or_feat">;
  decisions: ResolverDecision[];
};

type AbilityScoreKey = keyof NonNullable<
  ClassMulticlassPrerequisites["abilityMinimums"]
>;

type AbilityScoreRecord = Record<AbilityScoreKey, number>;

const MAX_CLASS_LEVEL = 20;

// #endregion

// #region Internal Helper Functions

const traitName = (traitId: string): string =>
  TRAIT_DICTIONARY[traitId]?.name ?? traitId.replace(/_/g, " ").toUpperCase();

/** the grants a class hands out at exactly this level */
const classGrantsAtLevel = (
  blueprint: ClassDefinition,
  targetLevel: number,
): FeatureGrant[] =>
  blueprint.progression.find((entry) => entry.level === targetLevel)?.grants ??
  [];

/** the grants a subclass hands out at exactly this level, if it belongs to the class */
const subclassGrantsAtLevel = (
  classId: string,
  subclassId: string | undefined,
  targetLevel: number,
): FeatureGrant[] => {
  if (!subclassId) return [];

  const subclass = SUBCLASS_DICTIONARY[subclassId];
  if (subclass?.classId !== classId) return [];

  return (
    subclass.progression.find((entry) => entry.level === targetLevel)?.grants ??
    []
  );
};

/**
 * Decisions carried by the traits granted at this level. These are the choices
 * that live inside a trait rather than on the level track: a proficiency choice
 * such as the rogue's Expertise, or a spell choice such as the High Elf cantrip.
 */
const traitDrivenDecisions = (traitIds: string[]): ResolverDecision[] => {
  const decisions: ResolverDecision[] = [];

  for (const traitId of traitIds) {
    const trait: TraitDefinition | undefined = TRAIT_DICTIONARY[traitId];
    if (!trait) continue;

    for (const choice of trait.proficiencies?.choices ?? []) {
      decisions.push({
        id: choice.id,
        type: "trait_selection",
        description: `Choose proficiencies for ${trait.name}.`,
        // an absent options list means "any from this category", so leave it
        // off rather than sending an empty allow-list
        ...(choice.options ? { options: choice.options } : {}),
        isRequired: true,
        quantity: choice.chooseAmount,
      });
    }

    for (const choice of trait.spells?.choices ?? []) {
      decisions.push({
        id: choice.nodeId,
        type: "spell_selection",
        description: `Choose spells granted by ${trait.name}.`,
        isRequired: true,
        quantity: choice.pickCount,
      });
    }
  }

  return decisions;
};

/** turns the progression nodes at this level into level-up decisions */
const grantDrivenDecisions = (
  grants: FeatureGrant[],
  sourceName: string,
): ResolverDecision[] => {
  const decisions: ResolverDecision[] = [];

  for (const grant of grants) {
    if (typeof grant === "string") continue;

    if (grant.type === "trait_choice") {
      decisions.push({
        id: grant.nodeId,
        type: "trait_selection",
        description: `Choose ${grant.pickCount} option(s) for ${sourceName}.`,
        options: grant.options.map(traitIdOfOption),
        isRequired: true,
        quantity: grant.pickCount,
      });
      continue;
    }

    // no options: there is no spell list data to enumerate from yet
    decisions.push({
      id: grant.nodeId,
      type: "spell_selection",
      description: `Choose ${grant.pickCount} spell(s) for ${sourceName}.`,
      isRequired: true,
      quantity: grant.pickCount,
    });
  }

  return decisions;
};

const meetsAbilityMinimums = (
  minimums: NonNullable<ClassMulticlassPrerequisites["abilityMinimums"]>,
  currentBaseScores: AbilityScoreRecord,
): boolean =>
  Object.entries(minimums).every(([ability, minimum]) => {
    if (minimum === undefined) {
      return true;
    }

    return currentBaseScores[ability as AbilityScoreKey] >= minimum;
  });

// #endregion

// #region Public API

export const assessMulticlassPrerequisites = ({
  classId,
  currentBaseScores,
}: {
  classId: string;
  currentBaseScores: AbilityScoreRecord;
}): { meetsPrerequisites: boolean; reason: string | null } => {
  const blueprint = CLASS_DICTIONARY[classId];
  if (!blueprint?.multiclassPrerequisites) {
    return {
      meetsPrerequisites: false,
      reason: `Multiclass definitions not found for ${classId}`,
    };
  }

  const { abilityMinimums, anyOf } = blueprint.multiclassPrerequisites;
  const meetsAllOf = abilityMinimums
    ? meetsAbilityMinimums(abilityMinimums, currentBaseScores)
    : true;
  const meetsAnyOf = anyOf
    ? anyOf.some((minimums) =>
        meetsAbilityMinimums(minimums, currentBaseScores),
      )
    : true;

  if (!meetsAllOf || !meetsAnyOf) {
    return {
      meetsPrerequisites: false,
      reason:
        "You do not meet the ability score prerequisites to multiclass into this class.",
    };
  }

  return {
    meetsPrerequisites: true,
    reason: null,
  };
};

export const validateMulticlassPrerequisites = ({
  classId,
  currentBaseScores,
}: {
  classId: string;
  currentBaseScores: AbilityScoreRecord;
}): void => {
  const assessment = assessMulticlassPrerequisites({
    classId,
    currentBaseScores,
  });

  if (!assessment.meetsPrerequisites) {
    throw new Error(
      assessment.reason ||
        "You do not meet the ability score prerequisites to multiclass into this class.",
    );
  }
};

/**
 * Builds the next level context for a character's class progression: what the
 * level grants and what the player still has to choose.
 *
 * Everything comes from the static rulebook in @project/engine, so this is
 * synchronous and needs no reference snapshot.
 */
export const resolveNextLevelValidationContext = ({
  classId,
  currentClassLevel,
  requestedSubclassId,
  isMulticlassDip = false,
}: {
  classId: string;
  currentClassLevel: number;
  requestedSubclassId?: string;
  isMulticlassDip?: boolean;
}): ResolverNextLevelContext => {
  const targetLevel = currentClassLevel + 1;
  const blueprint = CLASS_DICTIONARY[classId];

  const notConfigured = (reason: string): ResolverNextLevelContext => ({
    targetLevel,
    isConfigured: false,
    reason,
    grantedTraitIds: [],
    grantedTraits: [],
    decisionTypes: [],
    decisions: [],
  });

  if (!blueprint) {
    return notConfigured(`Unknown class: ${classId}`);
  }
  if (targetLevel < 1 || targetLevel > MAX_CLASS_LEVEL) {
    return notConfigured(
      `Level ${targetLevel} is not configured in class progression data.`,
    );
  }

  const decisionTypes: Array<"subclass" | "asi_or_feat"> = [];
  const decisions: ResolverDecision[] = [];
  const grantedTraits: ResolvedGrantedTrait[] = [];

  // a dip grants the reduced multiclass proficiency set instead of the full
  // level-1 package. Note this also skips the level's own features, which
  // mirrors how the reference data has always modelled it.
  if (isMulticlassDip && targetLevel === 1) {
    for (const traitId of blueprint.multiclassTraitIds) {
      grantedTraits.push({
        id: traitId,
        name: traitName(traitId),
        grantSourceType: "multiclass_grant",
      });
    }
  } else {
    for (const grant of classGrantsAtLevel(blueprint, targetLevel)) {
      if (typeof grant === "string") {
        grantedTraits.push({
          id: grant,
          name: traitName(grant),
          grantSourceType: "class_progression",
        });
      }
    }
    for (const grant of subclassGrantsAtLevel(
      classId,
      requestedSubclassId,
      targetLevel,
    )) {
      if (typeof grant === "string") {
        grantedTraits.push({
          id: grant,
          name: traitName(grant),
          grantSourceType: "subclass_progression",
        });
      }
    }
  }

  // #region decisions
  if (blueprint.subclassUnlockLevel === targetLevel) {
    decisionTypes.push("subclass");
    decisions.push({
      id: `dec_${classId}_subclass_${targetLevel}`,
      type: "subclass",
      description: "Choose a subclass for this class level.",
      options: listSubclassesForClass(classId).map((subclass) => subclass.id),
      isRequired: true,
      quantity: 1,
    });
  }

  const levelEntry = blueprint.progression.find(
    (entry) => entry.level === targetLevel,
  );
  if (!isMulticlassDip && levelEntry?.grantsASI) {
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

  if (!isMulticlassDip || targetLevel !== 1) {
    decisions.push(
      ...grantDrivenDecisions(
        classGrantsAtLevel(blueprint, targetLevel),
        blueprint.name,
      ),
    );

    const subclass = requestedSubclassId
      ? SUBCLASS_DICTIONARY[requestedSubclassId]
      : undefined;
    if (subclass?.classId === classId) {
      decisions.push(
        ...grantDrivenDecisions(
          subclassGrantsAtLevel(classId, requestedSubclassId, targetLevel),
          subclass.name,
        ),
      );
    }
  }

  decisions.push(
    ...traitDrivenDecisions(grantedTraits.map((trait) => trait.id)),
  );
  // #endregion

  return {
    targetLevel,
    isConfigured: true,
    reason: null,
    grantedTraitIds: grantedTraits.map((trait) => trait.id),
    grantedTraits,
    decisionTypes,
    decisions,
  };
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
    const selectedByDecision = selectedTraits as Record<string, unknown>;
    const exact = selectedByDecision[decisionId];

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

    // strict validation: the selected subclass has to belong to this class
    if (decision.type === "subclass" && payload.subclassId) {
      const subclass = SUBCLASS_DICTIONARY[payload.subclassId];
      if (!subclass || subclass.classId !== payload.targetClassId) {
        throw new Error(
          `${payload.subclassId} is not a subclass of ${payload.targetClassId}`,
        );
      }
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

      // the resolver knows the legal options, so reject anything off the list
      const allowed = decision.options;
      if (allowed && allowed.length > 0) {
        const invalid = selectedTraits.filter(
          (traitId) => !allowed.includes(traitId),
        );
        if (invalid.length > 0) {
          throw new Error(
            `${invalid.join(", ")} is not a valid option for ${decision.description}.`,
          );
        }
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
