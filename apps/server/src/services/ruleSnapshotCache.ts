import { db } from "@project/database";
import { items } from "@project/database/src/schema/reference.js";
import { resolveResourceRules } from "@project/engine";
import {
  ItemDefinitionSchema,
  RuleSnapshotSchema,
  type ItemDefinition,
  type RuleSnapshot,
} from "@project/shared";
import { and, eq } from "drizzle-orm";
import { getReferenceCacheVersion } from "./referenceCache.js";

type CachedRuleSnapshot = {
  cacheVersion: number;
  loadedAt: number;
  snapshot: Pick<RuleSnapshot, "itemsById" | "weaponsById" | "resourcesById">;
};

let cached: CachedRuleSnapshot | null = null;

const buildFallbackItemRule = (row: {
  id: string;
  name: string;
}): ItemDefinition =>
  ItemDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    type: "gear",
  });

const buildRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const ruleRows = await db
    .select({
      id: items.id,
      name: items.name,
      itemRule: items.itemRule,
      weaponRule: items.weaponRule,
    })
    .from(items)
    .where(and(eq(items.sourceType, "core"), eq(items.isPublished, true)));

  const itemsById = Object.fromEntries(
    ruleRows.map((row) => [row.id, row.itemRule ?? buildFallbackItemRule(row)]),
  );
  const weaponsById = Object.fromEntries(
    ruleRows
      .filter((row) => !!row.weaponRule)
      .map((row) => [row.id, row.weaponRule]),
  );

  const cacheVersion = getReferenceCacheVersion();

  const parsedSnapshot = RuleSnapshotSchema.parse({
    itemsById,
    weaponsById,
    resourcesById: resolveResourceRules(),
    traitsById: {},
  });

  return {
    cacheVersion,
    loadedAt: Date.now(),
    snapshot: {
      itemsById: parsedSnapshot.itemsById,
      weaponsById: parsedSnapshot.weaponsById,
      resourcesById: parsedSnapshot.resourcesById,
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
