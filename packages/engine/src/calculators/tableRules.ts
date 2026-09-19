import { CONDITION_MAP, type TraitDefinition } from "@project/shared";
import { AffinityEngine } from "./affinities.js";
import type { SuspendedCondition } from "./conditionSuppression.js";

/**
 * The lines the "Rules at the table" panel shows.
 *
 * A pure reporter beside SurpriseEngine: traits and states in, sentences out.
 * It never applies anything. A note is a rule the engine cannot enforce; an
 * affinity line is a rule the engine has no damage path to apply. Both are
 * things the player reads and acts on. A suppression line is a condition the
 * player toggled that a trait is holding off, as Mindless Rage holds off
 * frightened while raging.
 */

/**
 * `reporter` lines are composed by the widget from a trait-specific reporter
 * such as RelentlessRageEngine, whose input (hit points, a resource count) is
 * foreign to this one; describe never emits one.
 */
export type TableRuleLineKind = "note" | "affinity" | "suppression" | "reporter";

export interface TableRuleLine {
  kind: TableRuleLineKind;
  /** The trait the line came from, as the player knows it. */
  source: string;
  text: string;
}

export interface TableRulesInput {
  traits: TraitDefinition[];
  activeStates: string[];
  /** Toggled conditions a trait is holding off, from suppressConditions. */
  suspendedConditions?: SuspendedCondition[];
}

export interface StatePredicateLike {
  requiredStates?: string[];
  forbiddenStates?: string[];
}

export const predicateHolds = (
  predicate: StatePredicateLike,
  activeStates: string[],
): boolean =>
  (predicate.requiredStates ?? []).every((state) => activeStates.includes(state)) &&
  !(predicate.forbiddenStates ?? []).some((state) => activeStates.includes(state));

export class TableRulesEngine {
  public static describe({
    traits,
    activeStates,
    suspendedConditions = [],
  }: TableRulesInput): TableRuleLine[] {
    const lines: TableRuleLine[] = [];

    for (const trait of traits) {
      for (const note of trait.tableNotes ?? []) {
        if (!predicateHolds(note, activeStates)) continue;
        lines.push({ kind: "note", source: trait.name, text: note.text });
      }
    }

    for (const affinity of AffinityEngine.describe({ traits, activeStates })) {
      lines.push({ kind: "affinity", source: affinity.source, text: affinity.summary });
    }

    for (const { condition, source } of suspendedConditions) {
      const name = CONDITION_MAP[condition]?.name ?? condition;
      lines.push({ kind: "suppression", source, text: `${name} is suspended.` });
    }

    return lines;
  }
}
