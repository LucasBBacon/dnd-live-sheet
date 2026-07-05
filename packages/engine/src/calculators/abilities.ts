import type { Ability } from "../types/core.js";
import type { RuntimeModifier } from "@project/shared";

/**
 * AbilityEngine is a utility class that provides methods for calculating ability scores, modifiers, and proficiency bonuses in a Dungeons & Dragons 5e ruleset context.
 * It takes into account base scores, active modifiers, and level-based proficiency bonuses to provide accurate calculations for character abilities.
 */
export class AbilityEngine {
  /**
   * Calculates the final attribute score, factoring in magical overrides and ASIs.
   * @param base Base score of the ability (e.g., 10 for a standard human)
   * @param stat The ability being calculated (e.g., "str", "dex", etc.)
   * @param modifiers A list of active modifiers that may affect the ability score
   * @returns The final calculated ability score, capped at 30 per 5e ruleset
   */
  public static calculateScore(
    base: number,
    stat: Ability,
    modifiers: RuntimeModifier[],
  ): number {
    const activeMods = modifiers.filter(
      (m) => m.target === stat.toUpperCase() && m.isActive,
    );

    // 1 - check for hard overrides (e.g., amulet of health sets con to 19)
    const setters = activeMods.filter((m) => m.type === "set_base");
    let currentScore = base;

    if (setters.length > 0) {
      // find highest override
      const bestOverride = setters.reduce((prev, current) =>
        prev.value > current.value ? prev : current,
      );
      currentScore = Math.max(base, bestOverride.value);
    }

    // 2 - apply additive modifiers (e.g., +2 from an ASI or magic tome)
    const adders = activeMods.filter((m) => m.type === "add");
    const addedBonus = adders.reduce((sum, mod) => sum + mod.value, 0);

    // hard cap at 30 per 5e ruleset
    return Math.min(30, currentScore + addedBonus);
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
