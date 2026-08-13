import type { CoreRulePack } from "@project/shared";
import { db } from "./client.js";
import { coreRulePacks } from "./schema/reference.js";

export type CoreRulePackImportResult = {
  packId: string;
  version: number;
  publishedAt: Date;
};

/**
 * Persists the exact validated authoring payload in one transaction.
 *
 * The relational projection is deliberately separate: it is a derived query
 * model, while this row preserves every rule node the importer received.
 */
export const persistCoreRulePack = async (
  pack: CoreRulePack,
): Promise<CoreRulePackImportResult> => {
  const publishedAt = new Date(pack.pack.publishedAt);

  await db.transaction(async (tx) => {
    await tx
      .insert(coreRulePacks)
      .values({
        packId: pack.pack.packId,
        version: pack.pack.version,
        ruleset: pack.pack.ruleset,
        ...(pack.pack.contentHash === undefined
          ? {}
          : { contentHash: pack.pack.contentHash }),
        payload: pack,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: [coreRulePacks.packId, coreRulePacks.version],
        set: {
          ruleset: pack.pack.ruleset,
          contentHash: pack.pack.contentHash ?? null,
          payload: pack,
          publishedAt,
        },
      });
  });

  return {
    packId: pack.pack.packId,
    version: pack.pack.version,
    publishedAt,
  };
};
