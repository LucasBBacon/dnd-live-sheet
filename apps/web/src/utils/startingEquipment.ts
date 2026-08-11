import type {
  StartingEquipmentDefinition,
  StartingEquipmentGrant,
} from "@project/shared";

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
