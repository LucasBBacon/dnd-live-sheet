import { db } from "@project/database";
import { items } from "@project/database/src/schema/reference.js";
import { resolveResourceRules } from "@project/engine";
import {
  ItemDefinitionSchema,
  RuleSnapshotSchema,
  type EquipmentDefinition,
  type ItemDefinition,
  type RuleSnapshot,
} from "@project/shared";
import { and, eq } from "drizzle-orm";
import { getReferenceCacheVersion } from "./referenceCache.js";

type CachedRuleSnapshot = {
  cacheVersion: number;
  loadedAt: number;
  snapshot: Pick<RuleSnapshot, "equipmentById" | "itemsById" | "weaponsById" | "resourcesById">;
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

  // --- OLD APPROACH (dual-source construction, preserved for reference) ---
  // const itemsById = Object.fromEntries(
  //   ruleRows.map((row) => [row.id, row.itemRule ?? buildFallbackItemRule(row)]),
  // );
  // const weaponsById = Object.fromEntries(
  //   ruleRows
  //     .filter((row) => !!row.weaponRule)
  //     .map((row) => [row.id, row.weaponRule]),
  // );
  // --- END OLD APPROACH ---

  // Build canonical equipment map - single authored source for all equipment rules
  const equipmentById: Record<string, EquipmentDefinition> = Object.fromEntries(
    ruleRows.map((row) => {
      const itemRule = row.itemRule ?? buildFallbackItemRule(row);
      const entry: EquipmentDefinition = {
        id: itemRule.id,
        name: itemRule.name,
        type: itemRule.type ?? "gear",
        ...(itemRule.modifiers ? { modifiers: itemRule.modifiers } : {}),
        ...(row.weaponRule
          ? {
              weapon: {
                category: row.weaponRule.category,
                damageDice: row.weaponRule.damageDice,
                damageType: row.weaponRule.damageType,
                properties: row.weaponRule.properties,
                ...(row.weaponRule.ammoItemId
                  ? { ammoItemId: row.weaponRule.ammoItemId }
                  : {}),
              },
            }
          : {}),
      };
      return [row.id, entry];
    }),
  );

  // Derive compatibility projections from canonical equipment map
  const itemsById = Object.fromEntries(
    Object.entries(equipmentById).map(([id, eq]) => [
      id,
      {
        id: eq.id,
        name: eq.name,
        type: eq.type,
        ...(eq.modifiers ? { modifiers: eq.modifiers } : {}),
      } satisfies ItemDefinition,
    ]),
  );
  const weaponsById = Object.fromEntries(
    Object.entries(equipmentById)
      .filter(([, eq]) => !!eq.weapon)
      .map(([id, eq]) => [
        id,
        { id: eq.id, name: eq.name, ...eq.weapon! },
      ]),
  );

  const cacheVersion = getReferenceCacheVersion();

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
