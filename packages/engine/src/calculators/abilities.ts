import type { Ability } from "../types/core.js";
import type { RuntimeModifier } from "@project/shared";

export interface DerivedAbility {
  score: number;
  modifier: number;
  breakdown: string;
}

/**
 * AbilityEngine is a utility class that provides methods for calculating ability scores, modifiers, and proficiency bonuses in a Dungeons & Dragons 5e ruleset context.
 * It takes into account base scores, active modifiers, and level-based proficiency bonuses to provide accurate calculations for character abilities.
 */
export class AbilityEngine {
  /**
   * Calculates the final attribute score, factoring in ASIs, natural caps, and magical overrides.
   * @param base Base score of the ability
   * @param target The specific ability being calculated (e.g., "STR")
   * @param modifiers Array of all active runtime modifiers
   * @param activeStates Array of string flags representing the current environment
   * @returns A DerivedAbility object containing the final score, modifier, and a UI breakdown
   */
  public static calculateScore(
    base: number,
    target: Ability,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): DerivedAbility {
    const breakdownTokens: string[] = [`Base (${base})`];

    // filter for active modifiers targeting this specific ability that meet environmental states
    const validMods = modifiers.filter((m) => {
      if (m.target !== target || !m.isActive) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((state) => activeStates.includes(state))
        : true;
    });

    // calculate natural score (base + ASI/feats)
    const adders = validMods.filter((m) => m.type === "add");
    let naturalBonus = 0;

    for (const mod of adders) {
      naturalBonus += mod.value;
      const sign = mod.value >= 0 ? "+" : "";
      breakdownTokens.push(`${mod.sourceName} (${sign}${mod.value})`);
    }

    // default 5e natural cap is 20
    // TODO: INTERCEPT BARBARIAN CAPSTONE / TOMES raise the maxCap var here
    const maxCap = 20;

    // calculate capped natural score
    let finalScore = Math.min(base + naturalBonus, maxCap);

    if (base + naturalBonus > maxCap) {
      breakdownTokens.push(`(Capped at ${maxCap})`);
    }

    // evaluate hard overrides (e.g., Amulet of Health, Gauntlets of Ogre Power)
    // 5e - overrides do not stack with natural bonuses, complete override score
    const setters = validMods.filter((m) => m.type === "set_base");

    if (setters.length > 0) {
      // find highest override value
      const bestOverride = setters.reduce((prev, current) =>
        prev.value > current.value ? prev : current,
      );

      // overrides only apply if they are higher than character's natural score
      if (bestOverride.value > finalScore) {
        finalScore = bestOverride.value;
        // prepend the override explanation
        breakdownTokens.unshift(
          `Overridden by ${bestOverride.sourceName} (${bestOverride.value})`,
        );
        breakdownTokens.push("[Natural Score Ignored]");
      }
    }

    return {
      score: finalScore,
      modifier: this.getModifier(finalScore),
      breakdown: breakdownTokens.join(" | "),
    };
  }

  /**
   * Calculates the ability modifier for a given ability score.
   * @param score The ability score to calculate the modifier for (e.g., 10, 15, 20)
   * @returns The corresponding ability modifier, calculated as (score - 10) / 2 rounded down
   */
  public static getModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  /**
   * Calculates the proficiency bonus based on the character's total level.
   * @param totalLevel The total level of the character (sum of all class levels)
   * @returns The proficiency bonus, which increases at specific level thresholds (e.g., +2 at levels 1-4, +3 at levels 5-8, etc.)
   */
  public static getProficiencyBonus(totalLevel: number): number {
    return Math.ceil(totalLevel / 4) + 1;
  }
}
