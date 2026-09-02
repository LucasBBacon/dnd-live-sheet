import type { Resource, ResourceMaxRule, TraitDefinition } from "@project/shared";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";

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

export const getResourceMaxUses = (
  rule: Resource,
  totalLevel: number,
  classLevels: Record<string, number>,
): number => {
  switch (rule.maxRule.kind) {
    case "fixed":
      return rule.maxRule.value;
    case "total_level_thresholds":
      return resolveThresholdValue(rule.maxRule.thresholds, totalLevel);
    case "class_level_thresholds": {
      const currentLevel = classLevels[rule.maxRule.classId] ?? 0;
      return resolveThresholdValue(rule.maxRule.thresholds, currentLevel);
    }
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
  totalLevel: number,
  classLevels: Record<string, number>,
): MaterialisedPool[] => {
  const existing = new Set(existingIds);

  return granted
    .filter((resource) => !existing.has(resource.id))
    .map((resource) => {
      const max = getResourceMaxUses(resource, totalLevel, classLevels);
      return {
        id: resource.id,
        name: resource.name,
        current: max,
        max,
        resetCondition: resource.resetCondition,
      };
    });
};
