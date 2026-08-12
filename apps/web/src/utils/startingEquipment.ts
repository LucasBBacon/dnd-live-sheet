import type {
  RuleSnapshot,
  StartingEquipmentDefinition,
  StartingEquipmentGrant,
} from "@project/shared";
import { matchesStartingEquipmentCategory as sharedMatchesStartingEquipmentCategory } from "@project/shared";

const titleCase = (value: string): string =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export const formatEquipmentRefId = (refId: string): string => {
  if (refId.startsWith("money_")) {
    return refId.slice("money_".length).toUpperCase();
  }

  return titleCase(refId.replace(/^(item|category)_/, ""));
};

export const describeStartingEquipmentGrant = (
  grant: StartingEquipmentGrant,
): string => {
  if (grant.kind === "money") {
    return `${grant.quantity} ${formatEquipmentRefId(grant.refId)}`;
  }

  const label = formatEquipmentRefId(grant.refId);
  return grant.quantity > 1 ? `${label} x${grant.quantity}` : label;
};

export const flattenStartingEquipmentGrants = (
  startingEquipment: StartingEquipmentDefinition,
): StartingEquipmentGrant[] => [
  ...startingEquipment.given,
  ...startingEquipment.choices.flatMap((choice) =>
    choice.options.flatMap((option) => option.equipmentBundle),
  ),
];

export const buildStartingEquipmentCategoryKey = (
  scope: "class-given" | "background-given" | "class-choice",
  grantIndex: number,
  groupIndex?: number,
  optionIndex?: number,
): string => {
  if (scope === "class-choice") {
    return `${scope}:${groupIndex}:${optionIndex}:${grantIndex}`;
  }

  return `${scope}:${grantIndex}`;
};

export const buildCategoryItemOptions = (
  snapshot: Pick<RuleSnapshot, "itemsById"> | undefined,
  categoryRefId: string,
): Array<{ id: string; name: string }> => {
  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.itemsById)
    .filter((item) =>
      sharedMatchesStartingEquipmentCategory(
        {
          id: item.id,
          name: item.name,
          categoryTags: item.categoryTags,
        },
        categoryRefId,
      ),
    )
    .map((item) => ({ id: item.id, name: item.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const resolveCategoryGrant = (
  grant: StartingEquipmentGrant,
  key: string,
  selections: Record<string, StartingEquipmentGrant>,
): StartingEquipmentGrant => {
  if (grant.kind !== "category") {
    return grant;
  }

  return selections[key] ?? grant;
};
