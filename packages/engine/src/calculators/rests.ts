import type { RestCondition } from "@project/shared";
import type { RuntimeHealthState } from "../types/combat.js";
import type { OperationalResource } from "../types/resources.js";
import { resolveResourceRule, type RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { getResourceMaxUses } from "../utils/resourceRules.js";
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

  /**
   * The resource half of a rest, as a pure projection.
   *
   * executeShortRest/executeLongRest drive the live engine and mutate managers
   * in place. The web store holds a plain persisted array instead and needs to
   * *preview* a rest before committing it, so this returns a new array and
   * touches nothing. Both paths read the same reset conditions from the rules.
   *
   * @returns The resources as they would stand after the rest.
   */
  public static applyRest(
    resources: OperationalResource[],
    restType: "short" | "long",
    totalLevel: number,
    classLevels: Record<string, number>,
    snapshot?: RuleSnapshotLookup,
  ): OperationalResource[] {
    const isLongRest = restType === "long";

    return resources.map((resource) => {
      const rule = resolveResourceRule(resource.id, snapshot);

      // a resource with no rule behind it is left exactly as it is
      if (!rule) return resource;

      const maxUses = getResourceMaxUses(rule, totalLevel, classLevels);

      return {
        ...resource,
        current: restedCharges(
          rule.resetCondition,
          resource.current,
          maxUses,
          isLongRest,
        ),
      };
    });
  }
}

/**
 * How full a single resource is once the rest ends.
 *
 * "long_rest_half" is the hit-dice style recovery: you regain half your
 * maximum rounded down, but never less than one.
 */
const restedCharges = (
  resetCondition: RestCondition,
  current: number,
  maxUses: number,
  isLongRest: boolean,
): number => {
  switch (resetCondition) {
    case "short_rest":
      // short rest resources also come back on a long one
      return maxUses;
    case "long_rest":
    case "dawn":
      return isLongRest ? maxUses : current;
    case "long_rest_half":
      return isLongRest
        ? Math.min(maxUses, current + Math.max(1, Math.floor(maxUses / 2)))
        : current;
    case "never":
      return current;
  }
};
