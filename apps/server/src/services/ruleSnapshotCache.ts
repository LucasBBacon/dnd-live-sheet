import { db } from "@project/database";
import { coreRulePacks, items } from "@project/database/src/schema/reference.js";
import { RuleSnapshotSchema, toRuleSnapshot } from "@project/shared";
import { parseStoredPackPayload } from "./storedPackPayload.js";
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

  const { equipmentById, malformedItemIds } = projectEquipmentRows(ruleRows);

  // a row we could not parse is dropped rather than fatal, but it must not be
  // silent - an item missing from the snapshot resolves to nothing downstream
  if (malformedItemIds.length > 0) {
    console.warn(
      `[ruleSnapshotCache] skipped ${malformedItemIds.length} item(s) with unparsable rules: ${malformedItemIds.join(", ")}`,
    );
  }

  const cacheVersion = getReferenceCacheVersion();

  // the rule ASTs live in the pack payload. the relation tables are a query
  // model for the browse endpoints; reading traits from there would mean
  // reassembling this shape row by row instead of reading the one JSONB blob
  // that already matches it
  const [packRow] = await db
    .select({ payload: coreRulePacks.payload })
    .from(coreRulePacks)
    .orderBy(desc(coreRulePacks.version))
    .limit(1);

  // parsed once, then read twice below - both the snapshot and the resource
  // map come off the same blob, and validating only one of them would leave
  // the other reading a shape nothing had checked
  const packPayload = packRow
    ? parseStoredPackPayload(packRow.payload, "core_rule_packs.payload")
    : undefined;

  const packContent = packPayload ? toRuleSnapshot(packPayload) : undefined;

  // resources come from pack.resources, which toRuleSnapshot does not carry -
  // it holds only what the engine resolves through the rulebook path. the
  // static RESOURCE_DICTIONARY that used to fill this is gone, so without
  // this a short rest would find no rule and restore nothing
  const resourcesById = Object.fromEntries(
    (packPayload?.resources ?? []).map((resource) => [
      resource.id,
      resource,
    ]),
  );

  const parsedSnapshot = RuleSnapshotSchema.parse({
    equipmentById,
    resourcesById,
    traitsById: {},
  });

  return {
    cacheVersion,
    loadedAt: Date.now(),
    snapshot: {
      equipmentById: parsedSnapshot.equipmentById,
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
