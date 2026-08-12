import { characterInventory } from "@project/database/src/schema/operational.js";
import {
  bundleContents,
  items,
} from "@project/database/src/schema/reference.js";
import { db } from "@project/database";
import {
  isResolvedStartingEquipmentGrant,
  matchesStartingEquipmentCategory,
} from "@project/shared";
import { eq } from "drizzle-orm";

const resolveReadDb = (tx: any) => (tx?.select ? tx : db);

type StartingEquipmentGrant = {
  kind: "item" | "category" | "money";
  refId: string;
  quantity?: number;
};

type StartingEquipmentDefinitionLike = {
  given?: StartingEquipmentGrant[];
  choices?: Array<{
    choose?: number;
    options?: Array<{ equipmentBundle?: StartingEquipmentGrant[] }>;
  }>;
};

function isStartingEquipmentDefinition(
  value: unknown,
): value is StartingEquipmentDefinitionLike {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeGrantList(rawSelections: unknown): StartingEquipmentGrant[] {
  if (!isStartingEquipmentDefinition(rawSelections)) return [];

  const granted = Array.isArray(rawSelections.given) ? rawSelections.given : [];
  const choices = Array.isArray(rawSelections.choices)
    ? rawSelections.choices
    : [];

  if (choices.length > 0) {
    throw new Error(
      "Starting equipment choices must be resolved before inventory processing.",
    );
  }

  return granted;
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
  const readDb = resolveReadDb(tx);

  const [item] = await readDb
    .select()
    .from(items)
    .where(eq(items.id, itemId));
  if (!item) return [];

  if (!item.isBundle) {
    return [{ id: item.id, quantity: multiplier }];
  }

  // if it's a bundle, fetch contents and unpack
  const contents = await readDb
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
  const allItems = await tx.select().from(items);
  const match = allItems
    .filter((item: any) =>
      matchesStartingEquipmentCategory(
        {
          id: item?.id ?? "",
          name: item?.name ?? "",
          categoryTags: Array.isArray(item?.itemRule?.categoryTags)
            ? item.itemRule.categoryTags
            : [],
        },
        categoryRefId,
      ),
    )
    .sort((left: any, right: any) => {
      const leftKey = `${left.name ?? ""}::${left.id}`;
      const rightKey = `${right.name ?? ""}::${right.id}`;
      return leftKey.localeCompare(rightKey);
    })[0];

  if (!match) {
    return [];
  }

  return resolveItemPayload(tx, match.id, multiplier);
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
    if (!isResolvedStartingEquipmentGrant(grant)) {
      throw new Error(
        "Starting equipment categories must be resolved before inventory processing.",
      );
    }

    const resolved = await resolveItemPayload(
      tx,
      grant.refId,
      grant.quantity ?? 1,
    );

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
