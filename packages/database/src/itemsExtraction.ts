import {
  ItemDefinitionSchema,
  type ItemDefinition,
  WeaponDefinitionSchema,
  type WeaponDefinition,
} from "@project/shared";

// #region Type Definitions

type SourceItem = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  weight?: unknown;
  description?: unknown;
  lore?: { shortDescription?: unknown } | null;
  isBundle?: unknown;
  bundleContents?: Array<{ itemId?: unknown; quantity?: unknown }>;
  armorProperties?: {
    acApplication?: unknown;
    baseAc?: unknown;
    stealthDisadvantage?: unknown;
  } | null;
  weaponProperties?: {
    category?: unknown;
    damageDice?: unknown;
    versatileDamageDice?: unknown;
    damageType?: unknown;
    propertyIds?: unknown;
    ammoItemId?: unknown;
    rules?: Record<string, unknown>;
  } | null;
};

export type ExtractedSeedItem = {
  id: string;
  name: string;
  weight: number;
  description: string;
  itemRule: ItemDefinition;
  weaponRule?: WeaponDefinition;
  isBundle: boolean;
};

export type ExtractedBundleContent = {
  bundleId: string;
  itemId: string;
  quantity: number;
};

export type ItemsExtractionDiagnostics = {
  duplicateIds: Array<{
    id: string;
    firstIndex: number;
    duplicateIndex: number;
  }>;
  missingAmmoItemRefs: Array<{
    weaponId: string;
    ammoItemId: string;
  }>;
  unsupportedWeaponProperties: Array<{
    weaponId: string;
    property: string;
  }>;
};

export type ItemsExtractionResult = {
  seedItems: ExtractedSeedItem[];
  bundleContents: ExtractedBundleContent[];
  itemRulesById: Record<string, ItemDefinition>;
  weaponRulesById: Record<string, WeaponDefinition>;
  diagnostics: ItemsExtractionDiagnostics;
};

// #endregion

// #region Constants and Helper Functions

const SUPPORTED_WEAPON_PROPERTIES = new Set([
  "finesse",
  "thrown",
  "heavy",
  "light",
  "two_handed",
  "versatile",
  "reach",
  "ammunition",
  "loading",
  "special",
]);

const toStringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const toNumberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Authored weight in pounds, floored at zero.
 *
 * A negative weight is bad data, not a discount - and the rule payload is what
 * the engine sums, so clamping only the column let one bad row reduce a
 * character's carried total.
 */
const toPounds = (value: unknown): number => Math.max(0, toNumberOr(value, 0));

// persist as hundredths of a pound in an integer column, matching how the
// engine accumulates weight
const toStoredWeight = (pounds: number): number => Math.round(pounds * 100);

// #endregion

const deriveItemModifiers = (item: SourceItem): ItemDefinition["modifiers"] => {
  const modifiers: NonNullable<ItemDefinition["modifiers"]> = [];
  const armorProperties = item.armorProperties;

  if (armorProperties && typeof armorProperties === "object") {
    const acApplication = toStringOrUndefined(armorProperties.acApplication);
    const baseAc = toNumberOr(armorProperties.baseAc, 0);

    if (acApplication === "set") {
      modifiers.push({
        target: "ARMOR_CLASS",
        type: "set_base",
        value: baseAc,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      });
    }

    if (acApplication === "add") {
      modifiers.push({
        target: "ARMOR_CLASS",
        type: "add",
        value: baseAc,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      });
    }

    if (armorProperties.stealthDisadvantage === true) {
      modifiers.push({
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      });
    }
  }

  return modifiers.length > 0 ? modifiers : undefined;
};

const normalizeItemType = (item: SourceItem): ItemDefinition["type"] => {
  const sourceType = toStringOrUndefined(item.type);
  if (sourceType === "armor") return "armor";
  if (sourceType === "weapon") return "weapon";
  if (sourceType === "consumable") return "consumable";
  return "gear";
};

const deriveWeaponProperties = (
  weaponId: string,
  propertyIds: unknown,
  rules: unknown,
  diagnostics: ItemsExtractionDiagnostics,
): WeaponDefinition["properties"] => {
  const properties: WeaponDefinition["properties"] = [];

  if (Array.isArray(propertyIds)) {
    for (const rawPropertyId of propertyIds) {
      const propertyId = toStringOrUndefined(rawPropertyId);
      if (!propertyId) continue;

      const normalized = propertyId.replace(/^property_/, "");
      if (!SUPPORTED_WEAPON_PROPERTIES.has(normalized)) {
        diagnostics.unsupportedWeaponProperties.push({
          weaponId,
          property: normalized,
        });
        continue;
      }

      properties.push(normalized as WeaponDefinition["properties"][number]);
    }
  }

  if (rules && typeof rules === "object") {
    const flagMap: Array<{
      key: string;
      property: WeaponDefinition["properties"][number];
    }> = [
      { key: "loading", property: "loading" },
      { key: "special", property: "special" },
    ];

    for (const flag of flagMap) {
      if ((rules as Record<string, unknown>)[flag.key] === true) {
        properties.push(flag.property);
      }
    }
  }

  return [...new Set(properties)];
};

const canonicalizeWeaponCategory = (
  category: unknown,
): WeaponDefinition["category"] | undefined => {
  const value = toStringOrUndefined(category);
  if (
    value === "simple_melee" ||
    value === "martial_melee" ||
    value === "simple_ranged" ||
    value === "martial_ranged"
  ) {
    return value;
  }
  return undefined;
};

export const extractItemsForMigration = (
  rawItems: unknown[],
): ItemsExtractionResult => {
  const diagnostics: ItemsExtractionDiagnostics = {
    duplicateIds: [],
    missingAmmoItemRefs: [],
    unsupportedWeaponProperties: [],
  };

  const sourceItems = rawItems.filter(
    (item): item is SourceItem => !!item && typeof item === "object",
  );

  const dedupedItems: SourceItem[] = [];
  const firstSeenIndexById = new Map<string, number>();

  sourceItems.forEach((item, index) => {
    const id = toStringOrUndefined(item.id);
    if (!id) return;

    const firstSeen = firstSeenIndexById.get(id);
    if (firstSeen !== undefined) {
      diagnostics.duplicateIds.push({
        id,
        firstIndex: firstSeen,
        duplicateIndex: index,
      });
      return;
    }

    firstSeenIndexById.set(id, index);
    dedupedItems.push(item);
  });

  const itemIds = new Set<string>();
  const seedItems: ExtractedSeedItem[] = [];
  const bundleContents: ExtractedBundleContent[] = [];
  const itemRulesById: Record<string, ItemDefinition> = {};
  const weaponRulesById: Record<string, WeaponDefinition> = {};

  for (const item of dedupedItems) {
    const id = toStringOrUndefined(item.id);
    if (!id) continue;

    const name = toStringOrUndefined(item.name) ?? id;
    const description =
      toStringOrUndefined(item.description) ??
      toStringOrUndefined(item.lore?.shortDescription) ??
      "No description available.";

    const pounds = toPounds(item.weight);
    const weight = toStoredWeight(pounds);
    const isBundle = item.isBundle === true;
    const type = normalizeItemType(item);

    const itemDefinition = ItemDefinitionSchema.parse({
      id,
      name,
      type,
      // pounds, matching how EQUIPMENT_DICTIONARY authors weight. the `weight`
      // column beside this stores the same value in hundredths for integer
      // maths, and both now come from one clamped reading
      weight: pounds,
      modifiers: deriveItemModifiers(item),
    });
    itemRulesById[id] = itemDefinition;

    let weaponRule: WeaponDefinition | undefined;

    if (isBundle && Array.isArray(item.bundleContents)) {
      for (const bundleItem of item.bundleContents) {
        const bundleItemId = toStringOrUndefined(bundleItem.itemId);
        if (!bundleItemId) continue;
        bundleContents.push({
          bundleId: id,
          itemId: bundleItemId,
          quantity: toNumberOr(bundleItem.quantity, 1),
        });
      }
    }

    if (type === "weapon" && item.weaponProperties) {
      const category = canonicalizeWeaponCategory(
        item.weaponProperties.category,
      );
      const damageDice = toStringOrUndefined(item.weaponProperties.damageDice);
      const versatileDamageDice = toStringOrUndefined(
        item.weaponProperties.versatileDamageDice,
      );
      const damageType = toStringOrUndefined(item.weaponProperties.damageType);
      const ammoItemId = toStringOrUndefined(item.weaponProperties.ammoItemId);

      if (category && damageDice && damageType) {
        const parsedWeapon = WeaponDefinitionSchema.safeParse({
          id,
          name,
          category,
          damageDice,
          versatileDamageDice,
          damageType,
          properties: deriveWeaponProperties(
            id,
            item.weaponProperties.propertyIds,
            item.weaponProperties.rules,
            diagnostics,
          ),
          ammoItemId,
        });

        if (parsedWeapon.success) {
          weaponRule = parsedWeapon.data;
          weaponRulesById[id] = parsedWeapon.data;
        }
      }
    }

    itemIds.add(id);
    seedItems.push({
      id,
      name,
      weight,
      description,
      isBundle,
      itemRule: itemDefinition,
      ...(weaponRule ? { weaponRule } : {}),
    });
  }

  for (const [weaponId, weapon] of Object.entries(weaponRulesById)) {
    if (weapon.ammoItemId && !itemIds.has(weapon.ammoItemId)) {
      diagnostics.missingAmmoItemRefs.push({
        weaponId,
        ammoItemId: weapon.ammoItemId,
      });
    }
  }

  // keep this in step with EQUIPMENT_DICTIONARY.item_ring_of_protection: a ring
  // is worn but is not armor, and it only grants its bonuses once attuned
  const ringOfProtectionRule = ItemDefinitionSchema.parse({
    id: "item_ring_of_protection",
    name: "Ring of Protection",
    type: "wondrous",
    weight: 0,
    equipSlot: "ring",
    requiresAttunement: true,
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
      {
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
    ],
  });
  itemRulesById.item_ring_of_protection = ringOfProtectionRule;

  return {
    seedItems,
    bundleContents,
    itemRulesById,
    weaponRulesById,
    diagnostics,
  };
};
