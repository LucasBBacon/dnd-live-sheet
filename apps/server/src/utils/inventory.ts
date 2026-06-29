import { db } from "@project/database";
import { characterInventory } from "@project/database/src/schema/operational.js";
import {
  bundleContents,
  items,
} from "@project/database/src/schema/reference.js";
import { eq } from "drizzle-orm";

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

export async function processStartingEquipment(
  tx: any,
  characterId: string,
  rawSelections: Array<{ itemId: string; quantity: number }>,
) {
  if (rawSelections.length === 0) return;

  // unpack all selections (packs -> individual gear)
  const unpackedItems = [];
  for (const selection of rawSelections) {
    const resolved = await resolveItemPayload(
      tx,
      selection.itemId,
      selection.quantity,
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
