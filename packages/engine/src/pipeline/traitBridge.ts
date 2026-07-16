import type {
  ChoiceProficiencyGrant,
  FixedProficiencyGrant,
  ResolvedTraitChoice,
  RuntimeModifier,
  TraitDefinition,
} from "@project/shared";
import { TRAIT_DICTIONARY } from "../rules/traitDictionary.js";

type ProficiencyRank = "half" | "proficient" | "expertise";

export interface TraitProficiencyChoice extends ChoiceProficiencyGrant {
  traitId: string;
}

export interface CompiledTraitBenefits {
  modifiers: RuntimeModifier[];
  fixedProficiencyGrants: FixedProficiencyGrant[];
  proficiencyChoices: TraitProficiencyChoice[];
  proficiencyGrants: FixedProficiencyGrant[];
}

const PROFICIENCY_LEVEL_RANK: Record<ProficiencyRank, number> = {
  half: 0,
  proficient: 1,
  expertise: 2,
};

const toGrantKey = (grant: Pick<FixedProficiencyGrant, "category" | "proficiencyId">): string =>
  `${grant.category}:${grant.proficiencyId}`;

const keepHigherProficiencyLevel = (
  existing: FixedProficiencyGrant,
  candidate: FixedProficiencyGrant,
): FixedProficiencyGrant => {
  const existingRank = PROFICIENCY_LEVEL_RANK[existing.level as ProficiencyRank];
  const candidateRank = PROFICIENCY_LEVEL_RANK[candidate.level as ProficiencyRank];

  return candidateRank > existingRank ? candidate : existing;
};

const normaliseSelections = (
  choice: ChoiceProficiencyGrant,
  selectedProficiencyIds: string[] | undefined,
): string[] => {
  if (!selectedProficiencyIds?.length) return [];

  const uniqueSelections = Array.from(new Set(selectedProficiencyIds));
  const permittedSelections = choice.options
    ? uniqueSelections.filter((selection) => choice.options?.includes(selection))
    : uniqueSelections;

  return permittedSelections.slice(0, choice.chooseAmount);
};

/**
 * Compiles runtime mechanical trait benefits from static trait definitions.
 */
export class TraitBridge {
  public static compileTraitBenefits(
    activeTraitIds: string[],
    resolvedTraitChoices: ResolvedTraitChoice[] = [],
  ): CompiledTraitBenefits {
    const modifiers: RuntimeModifier[] = [];
    const proficiencyChoices: TraitProficiencyChoice[] = [];

    const fixedProficiencyGrantsByKey = new Map<string, FixedProficiencyGrant>();
    const allResolvedProficiencyGrantsByKey = new Map<string, FixedProficiencyGrant>();

    const traitIds = Array.from(new Set(activeTraitIds));

    const resolvedChoiceMap = new Map<string, ResolvedTraitChoice>();
    for (const resolvedChoice of resolvedTraitChoices) {
      resolvedChoiceMap.set(
        `${resolvedChoice.traitId}:${resolvedChoice.choiceId}`,
        resolvedChoice,
      );
    }

    for (const traitId of traitIds) {
      const traitDefinition: TraitDefinition | undefined =
        TRAIT_DICTIONARY[traitId];
      if (!traitDefinition) continue;

      for (const [
        modifierIndex,
        modifier,
      ] of traitDefinition.modifiers.entries()) {
        modifiers.push({
          id: `${traitId}_${modifierIndex}`,
          sourceName: traitDefinition.name,
          sourceOrigin: `trait:${traitId}`,
          isActive: true,
          ...modifier,
        });
      }

      const fixedGrants = traitDefinition.proficiencies?.fixed ?? [];
      for (const fixedGrant of fixedGrants) {
        const fixedKey = toGrantKey(fixedGrant);

        const existingFixed = fixedProficiencyGrantsByKey.get(fixedKey);
        fixedProficiencyGrantsByKey.set(
          fixedKey,
          existingFixed
            ? keepHigherProficiencyLevel(existingFixed, fixedGrant)
            : fixedGrant,
        );

        const existingResolved = allResolvedProficiencyGrantsByKey.get(fixedKey);
        allResolvedProficiencyGrantsByKey.set(
          fixedKey,
          existingResolved
            ? keepHigherProficiencyLevel(existingResolved, fixedGrant)
            : fixedGrant,
        );
      }

      const choiceGrants = traitDefinition.proficiencies?.choices ?? [];
      for (const choice of choiceGrants) {
        proficiencyChoices.push({
          traitId,
          ...choice,
        });

        const resolvedChoice = resolvedChoiceMap.get(`${traitId}:${choice.id}`);
        const resolvedSelections = normaliseSelections(
          choice,
          resolvedChoice?.selectedProficiencyIds,
        );

        for (const selectedProficiencyId of resolvedSelections) {
          const resolvedGrant: FixedProficiencyGrant = {
            category: choice.category,
            proficiencyId: selectedProficiencyId,
            level: choice.level,
          };
          const resolvedKey = toGrantKey(resolvedGrant);

          const existingResolved =
            allResolvedProficiencyGrantsByKey.get(resolvedKey);
          allResolvedProficiencyGrantsByKey.set(
            resolvedKey,
            existingResolved
              ? keepHigherProficiencyLevel(existingResolved, resolvedGrant)
              : resolvedGrant,
          );
        }
      }
    }

    const fixedProficiencyGrants = Array.from(fixedProficiencyGrantsByKey.values());
    const proficiencyGrants = Array.from(allResolvedProficiencyGrantsByKey.values());

    return {
      modifiers,
      fixedProficiencyGrants,
      proficiencyChoices,
      proficiencyGrants,
    };
  }
}
