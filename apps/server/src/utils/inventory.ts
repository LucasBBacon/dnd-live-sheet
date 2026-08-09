import { db } from "@project/database";
import { characterInventory } from "@project/database/src/schema/operational.js";
import {
  bundleContents,
  items,
} from "@project/database/src/schema/reference.js";
import { eq } from "drizzle-orm";

type LegacyStartingEquipmentSelection = {
  itemId: string;
  quantity: number;
};

type StartingEquipmentGrant = {
  kind: "item" | "category" | "money";
  refId: string;
  quantity?: number;
};

type StartingEquipmentDefinitionLike = {
  given?: StartingEquipmentGrant[];
  choices?: Array<{
    options?: Array<{ equipmentBundle?: StartingEquipmentGrant[] }>;
  }>;
};

function isStartingEquipmentDefinition(
  value: unknown,
): value is StartingEquipmentDefinitionLike {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("given" in value || "choices" in value)
  );
}

function normalizeGrantList(
  rawSelections: unknown,
): StartingEquipmentGrant[] {
  if (isStartingEquipmentDefinition(rawSelections)) {
    const grants = [...(rawSelections.given ?? [])];
    for (const choiceGroup of rawSelections.choices ?? []) {
      for (const option of choiceGroup.options ?? []) {
        if (option.equipmentBundle) {
          grants.push(...option.equipmentBundle);
        }
      }
    }

    return grants;
  }

  if (Array.isArray(rawSelections)) {
    return rawSelections.map((selection) => ({
      kind: "item" as const,
      refId: (selection as LegacyStartingEquipmentSelection).itemId,
      quantity: (selection as LegacyStartingEquipmentSelection).quantity,
    }));
  }

  return [];
}

function matchesCategory(item: any, categoryRefId: string): boolean {
  const category = categoryRefId.toLowerCase();
  const itemName = `${item?.name ?? ""} ${item?.id ?? ""}`.toLowerCase();
  const itemRule = item?.itemRule;
  const weaponRule = item?.weaponRule;

  const weaponCategoryMatches = (expected: string[]) => {
    return expected.includes(weaponRule?.category);
  };

  if (category.includes("weapon_")) {
    if (itemRule?.type !== "weapon") return false;

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
    return itemRule?.type === "armor" && itemName.includes("shield");
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
}

/**
 * Recursively resolves an item or bundle into a flat array of base items.
 * @param itemId Item or bundle ID.
 * @param multiplier Item quantity.
 * @returns Flat array of base item IDs and quantities.
 */
export async function resolveItemPayload(
  tx: any,
  itemId: string,
  multiplier = 1,
): Promise<Array<{ id: string; quantity: number }>> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) return [];

  if (!item.isBundle) {
    return [{ id: item.id, quantity: multiplier }];
  }

  // if it's a bundle, fetch contents and unpack
  const contents = await db
    .select()
    .from(bundleContents)
    .where(eq(bundleContents.bundleId, itemId));

  const resolved: Array<{ id: string; quantity: number }> = [];

  for (const child of contents) {
    // allows bundles to contain other bundles safely
    const childItems = await resolveItemPayload(
      tx,
      child.itemId,
      child.quantity * multiplier,
    );
    resolved.push(...childItems);
  }

  return resolved;
}

export async function resolveCategoryPayload(
  tx: any,
  categoryRefId: string,
  multiplier = 1,
): Promise<Array<{ id: string; quantity: number }>> {
  const allItems = await db.select().from(items);

  const resolved: Array<{ id: string; quantity: number }> = [];
  for (const item of allItems) {
    if (!matchesCategory(item, categoryRefId)) continue;
    const childItems = await resolveItemPayload(tx, item.id, multiplier);
    resolved.push(...childItems);
  }

  return resolved;
}

export async function processStartingEquipment(
  tx: any,
  characterId: string,
  rawSelections: unknown,
) {
  const grants = normalizeGrantList(rawSelections);
  if (grants.length === 0) return;

  // unpack all selections (packs -> individual gear)
  const unpackedItems = [];
  for (const grant of grants) {
    if (grant.kind === "money") continue;

    const resolved =
      grant.kind === "category"
        ? await resolveCategoryPayload(tx, grant.refId, grant.quantity ?? 1)
        : await resolveItemPayload(tx, grant.refId, grant.quantity ?? 1);

    unpackedItems.push(...resolved);
  }

  // aggregate duplicates using a Map
  const aggregatedInventory = new Map<string, number>();
  for (const item of unpackedItems) {
    const currentQuantity = aggregatedInventory.get(item.id) || 0;
    aggregatedInventory.set(item.id, currentQuantity + item.quantity);
  }

  // prepare relational payload
  const insertData = Array.from(aggregatedInventory.entries()).map(
    ([itemId, quantity]) => ({
      characterId,
      itemId,
      quantity,
    }),
  );

  // batch insert into operational inv
  if (insertData.length > 0) {
    await tx.insert(characterInventory).values(insertData);
  }
}
