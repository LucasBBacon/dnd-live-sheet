import type { TraitDefinition } from "@project/shared";

/**
 * Collects the persistent flags a character's traits carry.
 *
 * Traits could previously only speak through modifiers and proficiencies, so a
 * condition like Powerful Build - which changes a rule rather than a number -
 * had no way to reach the calculators. These states join the EffectManager's
 * temporary ones to form the baseline the stage-one calculators gate on.
 *
 * Deliberately pure and order-preserving, matching ModifierExtractor and
 * ProficiencyExtractor: same traits in, same states out, every time.
 */
export class StateExtractor {
  public static extractStates(traits: TraitDefinition[]): string[] {
    const states = new Set<string>();

    for (const trait of traits) {
      for (const state of trait.grantedStates ?? []) {
        states.add(state);
      }
    }

    return Array.from(states);
  }
}
