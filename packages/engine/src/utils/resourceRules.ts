import type { ResourceMaxRule, ResourceRule } from "@project/shared";

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
  rule: ResourceRule,
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
