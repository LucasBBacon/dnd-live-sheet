import type { ConditionSuppression } from "@project/shared";

export interface SuspendedCondition {
  condition: string;
  source: string;
}

export interface ConditionSuppressionResult {
  active: string[];
  suspended: SuspendedCondition[];
}

export const suppressConditions = (
  conditions: string[],
  suppressions: Array<ConditionSuppression & { source?: string }>,
  gatingStates: string[],
): ConditionSuppressionResult => {
  const conditionIds = new Set(conditions);
  const suspended = suppressions.filter(
    (suppression) =>
      conditionIds.has(suppression.condition) &&
      (suppression.requiredStates ?? []).every((state) => gatingStates.includes(state)) &&
      !(suppression.forbiddenStates ?? []).some((state) => gatingStates.includes(state)),
  );
  const suspendedIds = new Set(suspended.map((entry) => entry.condition));

  return {
    active: conditions.filter((condition) => !suspendedIds.has(condition)),
    suspended: suspended.map((entry) => ({
      condition: entry.condition,
      source: entry.source ?? "Unknown source",
    })),
  };
};