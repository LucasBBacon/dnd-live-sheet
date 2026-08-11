import type {
  ItemDefinition,
  RuleSnapshot,
  StartingEquipmentDefinition,
  StartingEquipmentGrant,
  WeaponDefinition,
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

const matchesCategory = (
  item: ItemDefinition,
  weaponRule: WeaponDefinition | undefined,
  categoryRefId: string,
): boolean => {
  const category = categoryRefId.toLowerCase();
  const itemName = `${item.name} ${item.id}`.toLowerCase();

  const weaponCategoryMatches = (expected: string[]) =>
    weaponRule ? expected.includes(weaponRule.category) : false;

  if (category.includes("weapon_")) {
    if (item.type !== "weapon") return false;

    if (category.includes("simple")) {
      if (category.includes("melee")) {
        return weaponCategoryMatches(["simple_melee"]);
      }
      if (category.includes("ranged")) {
        return weaponCategoryMatches(["simple_ranged"]);
      }
      return weaponCategoryMatches(["simple_melee", "simple_ranged"]);
    }

    if (category.includes("martial")) {
      if (category.includes("melee")) {
        return weaponCategoryMatches(["martial_melee"]);
      }
      if (category.includes("ranged")) {
        return weaponCategoryMatches(["martial_ranged"]);
      }
      return weaponCategoryMatches(["martial_melee", "martial_ranged"]);
    }
  }

  if (category.includes("armor_shield")) {
    return item.type === "armor" && itemName.includes("shield");
  }

  if (category.includes("holy_symbol")) {
    return itemName.includes("holy") || itemName.includes("symbol");
  }

  if (category.includes("arcane_focus")) {
    return itemName.includes("focus") || itemName.includes("arcane");
  }

  if (category.includes("druidic_focus")) {
    return itemName.includes("focus") || itemName.includes("druidic");
  }

  if (category.includes("musical_instrument")) {
    return itemName.includes("instrument") || itemName.includes("musical");
  }

  const tokens = category.replace(/^category_/, "").split("_");
  return tokens.every((token) => itemName.includes(token));
};

export const buildCategoryItemOptions = (
  snapshot: Pick<RuleSnapshot, "itemsById" | "weaponsById"> | undefined,
  categoryRefId: string,
): Array<{ id: string; name: string }> => {
  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.itemsById)
    .filter((item) =>
      matchesCategory(item, snapshot.weaponsById[item.id], categoryRefId),
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
