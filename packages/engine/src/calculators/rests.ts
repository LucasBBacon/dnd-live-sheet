import type { RuntimeHealthState } from "../types/combat.js";
import type { EffectManager } from "./effects.js";
import type { ResourceManager } from "./resources.js";

export interface CharacterRestContext {
  health: RuntimeHealthState;
  maxHp: number; // pre-calc by DerivedStatEngine
  effectManager: EffectManager;
  resourceManager: ResourceManager;
}

/**
 * The RestEngine class provides methods for applying the effects of rests (short or long) to a character's operational resources, such as hit points, spell slots, or other consumable resources.
 * It calculates the updated current values of these resources based on their defined reset conditions and maximum uses, taking into account the character's total level and class levels.
 * This class is designed to facilitate the management of resource recovery in a role-playing game context.
 */
export class RestEngine {
  /**
   * Executes a Short Rest.
   * @param context The live character state.
   * @param healingAmount The total HP rolled by the UI (includes CON modifiers)
   * @param hitDiceSpent A record of dice sizes and how many were spent (e.g., { "d8": 2 })
   */
  public static executeShortRest(
    context: CharacterRestContext,
    healingAmount: number = 0,
    hitDiceSpent: Record<string, number> = {},
  ): void {
    // 1 - deduct spent hit dice
    for (const [dieStr, amountSpent] of Object.entries(hitDiceSpent)) {
      const pool = context.health.hitDice[dieStr];
      if (pool) {
        pool.currentDice = Math.max(0, pool.currentDice - amountSpent);
      }
    }

    // 2 - apply healing (capped at max hp)
    if (healingAmount > 0) {
      context.health.currentHp = Math.min(
        context.health.currentHp + healingAmount,
        context.maxHp,
      );
    }

    // 3 - tick downstream managers
    context.effectManager.tickRest(false); // drops "rest_short" buffs
    context.resourceManager.tickRest(false); // resets warlock slots, ki points, etc

    console.log("Short rest completed.");
  }

  /**
   * Executes a Long Rest, fully healing the character and restoring half their max Hit Dice.
   * @param context The live character state
   */
  public static executeLongRest(context: CharacterRestContext): void {
    // 1 - reset HP and drop temp HP
    context.health.currentHp = context.maxHp;
    context.health.tempHp = 0;

    // 2 - restore hit dice
    // 5e: restore half of total max, min 1
    let totalMaxDice = 0;
    for (const pool of Object.values(context.health.hitDice)) {
      totalMaxDice += pool.maxDice;
    }

    // calculate how many dice area allowed to regain today
    let diceToRegain = Math.max(1, Math.floor(totalMaxDice / 2));

    // engine handles multiclassing
    // prioritizes restoring largest hit dice first
    const sortedPools = Object.values(context.health.hitDice).sort(
      (a, b) => b.dieSize - a.dieSize,
    );

    for (const pool of sortedPools) {
      if (diceToRegain <= 0) break;

      const missingDice = pool.maxDice - pool.currentDice;
      if (missingDice > 0) {
        const regainAmount = Math.min(missingDice, diceToRegain);
        pool.currentDice += regainAmount;
        diceToRegain -= regainAmount;
      }
    }

    // 3 - tick downstream managers
    context.effectManager.tickRest(true);
    context.resourceManager.tickRest(true);

    console.log("Long rest completed.");
  }
}
