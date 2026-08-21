import { db } from "@project/database";
import { coreRulePacks, items } from "@project/database/src/schema/reference.js";
import { resolveResourceRules } from "@project/engine";
import { RuleSnapshotSchema, toRuleSnapshot } from "@project/shared";
import { and, desc, eq } from "drizzle-orm";
import { getReferenceCacheVersion } from "./referenceCache.js";
import { projectEquipmentRows } from "./ruleSnapshotProjection.js";
import type { RulesSnapshotPayload } from "./referenceProvider/types.js";

type CachedRuleSnapshot = {
  cacheVersion: number;
  loadedAt: number;
  snapshot: RulesSnapshotPayload;
};

let cached: CachedRuleSnapshot | null = null;

const buildRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const ruleRows = await db
    .select({
      id: items.id,
      name: items.name,
      // the storage-canonical weight, in hundredths of a pound. read from the
      // column rather than the rule payload because payloads written before
      // the extractor carried weight hold a stale 0
      weight: items.weight,
      itemRule: items.itemRule,
      weaponRule: items.weaponRule,
    })
    .from(items)
    .where(and(eq(items.sourceType, "core"), eq(items.isPublished, true)));

  const { equipmentById, itemsById, weaponsById, malformedItemIds } =
    projectEquipmentRows(ruleRows);

  // a row we could not parse is dropped rather than fatal, but it must not be
  // silent - an item missing from the snapshot resolves to nothing downstream
  if (malformedItemIds.length > 0) {
    console.warn(
      `[ruleSnapshotCache] skipped ${malformedItemIds.length} item(s) with unparsable rules: ${malformedItemIds.join(", ")}`,
    );
  }

  const cacheVersion = getReferenceCacheVersion();

  // the rule ASTs live in the pack payload. the relation tables are a query
  // model for the browse endpoints and store effects: [] by design, so reading
  // traits from there would yield definitions that do nothing
  const [packRow] = await db
    .select({ payload: coreRulePacks.payload })
    .from(coreRulePacks)
    .orderBy(desc(coreRulePacks.version))
    .limit(1);

  const packContent = packRow ? toRuleSnapshot(packRow.payload) : undefined;

  const parsedSnapshot = RuleSnapshotSchema.parse({
    equipmentById,
    itemsById,
    weaponsById,
    resourcesById: resolveResourceRules(),
    traitsById: {},
  });

  return {
    cacheVersion,
    loadedAt: Date.now(),
    snapshot: {
      equipmentById: parsedSnapshot.equipmentById,
      itemsById: parsedSnapshot.itemsById,
      weaponsById: parsedSnapshot.weaponsById,
      resourcesById: parsedSnapshot.resourcesById,
      ...(packContent ?? {}),
    },
  };
};

export const getCachedRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const cacheVersion = getReferenceCacheVersion();
  if (cached && cached.cacheVersion === cacheVersion) {
    return cached;
  }

  const rebuilt = await buildRuleSnapshot();
  cached = rebuilt;
  return rebuilt;
};

export const invalidateRuleSnapshotCache = (): void => {
  cached = null;
};
