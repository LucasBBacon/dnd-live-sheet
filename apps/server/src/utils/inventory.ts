import { db } from "@project/database";
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
      child.itemId,
      child.quantity * multiplier,
    );
    resolved.push(...childItems);
  }

  return resolved;
}
