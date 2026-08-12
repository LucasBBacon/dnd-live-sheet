import type {
  StartingEquipmentDefinition,
  StartingEquipmentCategoryTag,
  StartingEquipmentGrant,
} from "./schemas/items.js";

export type StartingEquipmentCategoryCandidate = {
  id: string;
  name: string;
  categoryTags?: readonly StartingEquipmentCategoryTag[] | null;
};

export type StartingEquipmentResolutionStatus = {
  hasUnresolvedChoices: boolean;
  unresolvedGivenCategoryRefIds: string[];
  isResolved: boolean;
};

export const getStartingEquipmentResolutionStatus = (
  startingEquipment: StartingEquipmentDefinition,
): StartingEquipmentResolutionStatus => {
  const hasUnresolvedChoices = startingEquipment.choices.length > 0;
  const unresolvedGivenCategoryRefIds = startingEquipment.given
    .filter((grant) => grant.kind === "category")
    .map((grant) => grant.refId);

  return {
    hasUnresolvedChoices,
    unresolvedGivenCategoryRefIds,
    isResolved:
      !hasUnresolvedChoices && unresolvedGivenCategoryRefIds.length === 0,
  };
};

export const isResolvedStartingEquipmentGrant = (
  grant: Pick<StartingEquipmentGrant, "kind">,
): boolean => grant.kind !== "category";

export const matchesStartingEquipmentCategory = (
  candidate: StartingEquipmentCategoryCandidate,
  categoryRefId: string,
): boolean => {
  const tags = candidate.categoryTags ?? [];
  const normalizedCategory = categoryRefId.toLowerCase();

  return tags.includes(normalizedCategory as StartingEquipmentCategoryTag);
};
