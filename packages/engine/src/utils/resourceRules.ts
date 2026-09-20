import type { Resource, ResourceMaxRule, TraitDefinition } from "@project/shared";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { casterLevel, collectCastingSources } from "../rules/casterLevel.js";

type ThresholdRule = Extract<
  ResourceMaxRule,
  { thresholds: readonly unknown[] }
>;

const resolveThresholdValue = (
  thresholds: ThresholdRule["thresholds"],
  currentLevel: number,
): number => {
  let resolved = 0;

  for (const threshold of thresholds) {
    if (currentLevel >= threshold.minimumLevel) {
      resolved = threshold.value;
    }
  }

  return resolved;
};

/**
 * Every level a resource rule can be measured against, in one argument.
 *
 * Three separate parameters were threaded through six call sites before
 * caster level existed. A fourth, optional and defaulting to zero, would have
 * let any site that forgot it resolve every spell slot pool to zero - a wizard
 * whose slots quietly vanish, with nothing failing. One required argument puts
 * that on the compiler instead.
 */
export interface LevelContext {
  totalLevel: number;
  classLevels: Record<string, number>;
  /** 0 when the character casts nothing that uses slots. */
  casterLevel: number;
}

/**
 * The level context for a character, derived from what they have taken.
 * @param classLevels Class id to level.
 * @param subclassIds Class id to the subclass chosen for it, if any.
 * @param snapshot Pack content, when the caller has any loaded.
 * @returns totalLevel, classLevels and casterLevel together.
 */
export const buildLevelContext = (
  classLevels: Record<string, number>,
  subclassIds: Record<string, string | null | undefined> = {},
  snapshot?: RuleSnapshotLookup,
): LevelContext => ({
  totalLevel: Object.values(classLevels).reduce((sum, level) => sum + level, 0),
  classLevels,
  casterLevel: casterLevel(
    collectCastingSources(classLevels, subclassIds, snapshot),
  ),
});

export const getResourceMaxUses = (
  rule: Resource,
  levels: LevelContext,
): number => {
  if (rule.mode === "uses") return 0;
  switch (rule.maxRule.kind) {
    case "fixed":
      return rule.maxRule.value;
    case "total_level_thresholds":
      return resolveThresholdValue(rule.maxRule.thresholds, levels.totalLevel);
    case "class_level_thresholds": {
      const currentLevel = levels.classLevels[rule.maxRule.classId] ?? 0;
      return resolveThresholdValue(rule.maxRule.thresholds, currentLevel);
    }
    case "caster_level_thresholds":
      return resolveThresholdValue(rule.maxRule.thresholds, levels.casterLevel);
  }
};

/**
 * The pools a set of traits puts on a character.
 *
 * Two sources, by convention: a pool authored on the trait itself, and a
 * pack-level pool carrying the trait's own id (trait_action_surge grants
 * trait_action_surge). Deduplicated by id, last writer wins.
 */
export const collectGrantedResources = (
  traits: TraitDefinition[],
  snapshot?: RuleSnapshotLookup,
): Resource[] => {
  const byId = new Map<string, Resource>();

  for (const trait of traits) {
    for (const resource of trait.resources ?? []) byId.set(resource.id, resource);

    const packLevel = snapshot?.resourcesById?.[trait.id];
    if (packLevel) byId.set(packLevel.id, packLevel);
  }

  return [...byId.values()];
};

export interface MaterialisedPool {
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition: Resource["resetCondition"];
  mode?: Resource["mode"];
}

/**
 * Rows to create for pools the character is granted but does not yet hold.
 *
 * Only the sample seeder ever wrote character_resources; a real character had
 * no Rage row and every rage failed insufficient_resource. Idempotent: an id
 * already present is skipped, so calling this on every touch is safe.
 */
export const materialiseMissingPools = (
  existingIds: Iterable<string>,
  granted: Resource[],
  levels: LevelContext,
): MaterialisedPool[] => {
  const existing = new Set(existingIds);

  return granted
    .filter((resource) => !existing.has(resource.id))
    .map((resource) => {
      const max = getResourceMaxUses(resource, levels);
      return {
        id: resource.id,
        name: resource.name,
        current: max,
        max,
        resetCondition: resource.resetCondition,
        ...(resource.mode !== undefined && { mode: resource.mode }),
      };
    });
};
