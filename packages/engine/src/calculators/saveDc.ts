import type { SaveDcRule } from "@project/shared";

/**
 * The DC of a self-save, from its rule and how often it has been made since
 * its pool last reset.
 *
 * The resolver rolls against this and the Rules panel reports it, so the DC a
 * player reads is the DC the server rolls against.
 * @param rule The effect's DC rule.
 * @param usesSoFar The count before this attempt.
 * @returns The DC this attempt is made against.
 */
export const resolveSelfSaveDc = (rule: SaveDcRule, usesSoFar: number): number =>
  rule.kind === "fixed" ? rule.value : rule.base + rule.increasePerUse * usesSoFar;

/**
 * The uses pool an escalating rule counts, which is also the pool each
 * attempt increments.
 * @param rule The effect's DC rule.
 * @returns The resource id, or undefined for a fixed DC.
 */
export const selfSaveCounterId = (rule: SaveDcRule): string | undefined =>
  rule.kind === "escalating_per_use" ? rule.resourceId : undefined;
