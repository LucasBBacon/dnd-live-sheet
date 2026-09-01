import { and, eq, sql } from "drizzle-orm";
import type { InventoryLedger } from "@project/engine";
import { db } from "@project/database";
import { characterInventory } from "@project/database/src/schema/operational.js";

export interface BufferedInventoryLedger extends InventoryLedger {
  /** Deductions taken during resolution, in the order they were taken. */
  readonly pending: ReadonlyArray<{ id: string; amount: number }>;
}

/**
 * A ledger over rows already read for this resolution.
 *
 * Reads are served from the snapshot the caller fetched, so the resolver never
 * awaits mid-settlement; writes are buffered and flushed afterwards by
 * `flushInventoryLedger`. Splitting it this way is what lets a synchronous
 * engine port sit on top of an asynchronous store.
 */
export const buildInventoryLedger = (
  rows: Array<{ id: string; itemId: string; quantity: number }>,
): BufferedInventoryLedger => {
  const byId = new Map(rows.map((row) => [row.id, { ...row }]));
  const pending: Array<{ id: string; amount: number }> = [];

  return {
    pending,
    getStack: (instanceId) => byId.get(instanceId),
    consumeStack: (instanceId, amount) => {
      const stack = byId.get(instanceId);
      if (!stack) return;
      stack.quantity -= amount;
      pending.push({ id: instanceId, amount });
    },
  };
};

/**
 * Persists what the resolver spent.
 *
 * Mirrors the ITEM_CONSUMED handler exactly - a stack that reaches zero is
 * swept rather than left as a zero row - so the two paths cannot drift into
 * disagreeing about what an empty stack is.
 *
 * Returns only the deductions that actually landed. A pending entry whose row
 * has since vanished is skipped rather than written, and the caller must not
 * tell the room about a deduction the database never took - broadcasting the
 * full `ledger.pending` regardless would have the client delete a stack that,
 * as far as the database is concerned, was never touched.
 */
export const flushInventoryLedger = async (
  characterId: string,
  ledger: BufferedInventoryLedger,
): Promise<ReadonlyArray<{ id: string; amount: number }>> => {
  if (ledger.pending.length === 0) return [];

  return await db.transaction(async (tx) => {
    const written: Array<{ id: string; amount: number }> = [];

    for (const deduction of ledger.pending) {
      const [row] = await tx
        .select({ quantity: characterInventory.quantity })
        .from(characterInventory)
        .where(
          and(
            eq(characterInventory.id, deduction.id),
            eq(characterInventory.characterId, characterId),
          ),
        );

      if (!row) continue;

      if (row.quantity - deduction.amount <= 0) {
        await tx
          .delete(characterInventory)
          .where(eq(characterInventory.id, deduction.id));
        written.push(deduction);
        continue;
      }

      await tx
        .update(characterInventory)
        .set({
          quantity: sql`${characterInventory.quantity} - ${deduction.amount}`,
        })
        .where(eq(characterInventory.id, deduction.id));
      written.push(deduction);
    }

    return written;
  });
};
