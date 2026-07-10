import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractItemsForMigration } from "@project/database/src/itemsExtraction.js";
import { resolveResourceRules } from "@project/engine";
import { RuleSnapshotSchema, type RuleSnapshot } from "@project/shared";
import { getReferenceCacheVersion } from "./referenceCache.js";

type CachedRuleSnapshot = {
  cacheVersion: number;
  loadedAt: number;
  snapshot: Pick<RuleSnapshot, "itemsById" | "weaponsById" | "resourcesById">;
};

let cached: CachedRuleSnapshot | null = null;

const readItemsJson = async (): Promise<unknown[]> => {
  const filePath = path.resolve(process.cwd(), "packages/database/data/items.json");
  const rawJson = await readFile(filePath, "utf-8");
  return JSON.parse(rawJson) as unknown[];
};

const buildRuleSnapshot = async (): Promise<CachedRuleSnapshot> => {
  const rawItems = await readItemsJson();
  const extracted = extractItemsForMigration(rawItems);
  const cacheVersion = getReferenceCacheVersion();

  const parsedSnapshot = RuleSnapshotSchema.parse({
    itemsById: extracted.itemRulesById,
    weaponsById: extracted.weaponRulesById,
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
