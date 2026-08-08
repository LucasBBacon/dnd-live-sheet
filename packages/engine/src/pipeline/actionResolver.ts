import type { ActionGrant, DamageType, EngineEvent, TriggerGrant } from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { DiceEngine } from "../utils/diceParser.js";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import type { InventoryLedger } from "./inventoryLedger.js";
import type {
  ConsumedResource,
  RollContextPayload,
} from "./rollContextBuilder.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

export type ActionFailureReason =
  | "insufficient_resource"
  | "missing_stack"
  | "insufficient_stack"
  | "wrong_ammo"
  | "ammo_not_selected"
  | "no_ledger"
  | "unrequested_cost"
  | "summon_limit_reached";

export interface ActionRollResult {
  total: number;
  rolls: number[];
  modifier: number;
  target: "DAMAGE_ROLL" | "ATTACK_ROLL" | "SAVING_THROW" | "ABILITY_CHECK";
  damageType?: DamageType;
}

export interface ActionResult {
  executed: boolean;
  reason?: ActionFailureReason;
  /** Which cost failed, for a message the player can act on. */
  offendingId?: string;
  rollResults?: ActionRollResult[];
}

export interface ActionExecutionContext {
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  /** Required only for actions that spend ammunition. */
  inventoryLedger?: InventoryLedger;
  snapshot?: RuleSnapshotLookup;
  activeStates?: string[];
  diceRules?: Array<{
    target: "DAMAGE_ROLL" | "ATTACK_ROLL" | "SAVING_THROW" | "ABILITY_CHECK";
    requiredStates: string[];
    requiredDamageType?: DamageType;
    mutator: {
      type: "reroll_once" | "minimum_value" | "explode";
      triggerOn?: number[];
      floorValue?: number;
    };
  }>;
}

const ok: ActionResult = { executed: true };

const fail = (
  reason: ActionFailureReason,
  offendingId?: string,
): ActionResult => ({
  executed: false,
  reason,
  ...(offendingId !== undefined && { offendingId }),
});

const hasStatePredicate = (effect: ActionGrant["effect"]): boolean =>
  "requiredStates" in effect || "forbiddenStates" in effect;

const matchesStatePredicate = (
  effect: ActionGrant["effect"],
  activeStates: string[],
): boolean => {
  const requiredStates =
    "requiredStates" in effect && Array.isArray(effect.requiredStates)
      ? effect.requiredStates
      : [];
  const forbiddenStates =
    "forbiddenStates" in effect && Array.isArray(effect.forbiddenStates)
      ? effect.forbiddenStates
      : [];

  const meetsRequired = requiredStates.every((state) => activeStates.includes(state));
  const hasForbidden = forbiddenStates.some((state) => activeStates.includes(state));

  return meetsRequired && !hasForbidden;
};

/**
 * ActionResolver handles the execution of proactive abilities, translating
 * static data blueprints into live engine state.
 */
export class ActionResolver {
  /**
   * Executes an action.
   *
   * Costs are settled before the effect fires, in two phases: everything the
   * roll spends is validated first, and only then committed. A roll that
   * spends both ki and a +1 arrow must not swallow the arrow and then discover
   * the ki pool is empty.
   *
   * @param action The action being executed.
   * @param payload What the player chose in the roll preparation step —
   *   notably *which* stack of ammunition, when they carry more than one kind.
   * @param context Injected managers, plus the inventory ledger for ammunition.
   */
  public static execute(
    action: ActionGrant,
    payload: RollContextPayload,
    context: ActionExecutionContext,
  ): ActionResult {
    const requested = payload.consumedResources ?? [];
    const activeStates =
      payload.activeStates.length > 0
        ? payload.activeStates
        : context.activeStates ?? [];

    if (hasStatePredicate(action.effect) && !matchesStatePredicate(action.effect, activeStates)) {
      return ok;
    }

    // 1 - settle every cost, or none of them
    const settlement = this.settleCosts(action, requested, context);
    if (!settlement.executed) return settlement;

    // 2 - route the effect to correct handler
    return this.executeEffect(action.effect, action, context, payload.activeStates);
  }

  public static dispatchEvent(
    eventName: EngineEvent,
    triggerGrants: TriggerGrant[],
    actionLookup: Record<string, ActionGrant>,
    context: ActionExecutionContext,
    payload: RollContextPayload = { actionId: "", activeStates: [] },
  ): ActionResult[] {
    const results: ActionResult[] = [];

    for (const trigger of triggerGrants) {
      if (trigger.listenFor !== eventName) continue;

      const actionId = actionLookup[trigger.executeAction]
        ? trigger.executeAction
        : trigger.executeAction.toLowerCase();
      const action = actionLookup[actionId];
      if (!action) {
        results.push(ok);
        continue;
      }

      if (trigger.consumeResource) {
        const consumed = context.resourceManager.consume(
          trigger.consumeResource,
          1,
        );
        if (!consumed) {
          results.push(fail("insufficient_resource", trigger.consumeResource));
          continue;
        }
      }

      const result = this.execute(action, payload, context);
      if (!result.executed && trigger.consumeResource) {
        context.resourceManager.restore(trigger.consumeResource, 1);
      }

      results.push(result);
    }

    return results;
  }

  private static executeEffect(
    effect: ActionGrant["effect"],
    action: ActionGrant,
    context: ActionExecutionContext,
    activeStates: string[] = [],
  ): ActionResult {
    switch (effect.type) {
      case "apply_effect": {
        const blueprint = effect;

        if (
          blueprint.effectName?.toLowerCase().includes("dismiss") ||
          action.name.toLowerCase().includes("dismiss")
        ) {
          const activeSummons = context.effectManager
            .getActiveEffects()
            .filter((entry) => entry.kind === "summon");

          if (activeSummons.length > 0) {
            const [summon] = activeSummons;
            if (summon) {
              context.effectManager.removeEffect(summon.instanceId);
            }
          }

          return ok;
        }

        // translate static blueprint into live ActiveEffect
        const newEffect: ActiveEffect = {
          instanceId: `effect_${generateId()}`,
          sourceName: blueprint.effectName || action.name,
          durationType: blueprint.durationType,
          durationRemaining: blueprint.durationRounds,
          isSelfConcentration: blueprint.isSelfConcentration,
          // deep clone modifiers to prevent mutating static dict data
          modifiers: JSON.parse(JSON.stringify(blueprint.modifiers)),
          grantedStates: [...blueprint.states],
        };

        context.effectManager.addEffect(newEffect);
        return ok;
      }
      case "attack": {
        const damageSegments = effect.damage ?? [];
        const rollResults: ActionRollResult[] = [];

        for (const segment of damageSegments) {
          const baseDice = segment.baseDice;
          const roll = DiceEngine.rollDigital(baseDice);
          const appliedRolls = DiceEngine.applyDiceRules(
            roll.rolls,
            context.diceRules ?? [],
            "DAMAGE_ROLL",
            {
              activeStates: activeStates.length > 0 ? activeStates : context.activeStates ?? [],
              sides: Number.parseInt(baseDice.split("d")[1] ?? "6", 10),
              rollFn: (sides) =>
                DiceEngine.rollDigital(`1d${sides}`).total,
            },
          );

          const total = appliedRolls.reduce((sum, value) => sum + value, 0);
          rollResults.push({
            total,
            rolls: appliedRolls,
            modifier: roll.modifier,
            target: "DAMAGE_ROLL",
            damageType: segment.damageType,
          });
        }

        return { ...ok, rollResults };
      }

      case "summon": {
        const activeSummons = context.effectManager
          .getActiveEffects()
          .filter((entry) => entry.kind === "summon");

        if (effect.maxActive !== undefined && activeSummons.length >= effect.maxActive) {
          return fail("summon_limit_reached");
        }

        const newEffect: ActiveEffect = {
          instanceId: `effect_${generateId()}`,
          sourceName: action.name,
          durationType: effect.durationHours !== undefined ? "rounds" : "manual",
          durationRemaining:
            effect.durationHours !== undefined
              ? Math.max(1, Math.ceil((effect.durationHours * 60) / 24))
              : undefined,
          isSelfConcentration: false,
          modifiers: [],
          grantedStates: [...effect.entityTemplateIds],
          kind: "summon",
        };

        if (effect.durationHours !== undefined) {
          newEffect.durationHours = effect.durationHours;
        }

        context.effectManager.addEffect(newEffect);
        return ok;
      }

      case "macro": {
        for (const nestedEffect of effect.effects) {
          const nestedResult = this.executeEffect(
            nestedEffect,
            action,
            context,
            activeStates,
          );
          if (!nestedResult.executed) return nestedResult;
        }

        return ok;
      }

      case "damage_rider": {
        const rollResults: ActionRollResult[] = [];

        for (const segment of effect.damage) {
          const baseDice = segment.baseDice;
          const roll = DiceEngine.rollDigital(baseDice);
          const appliedRolls = DiceEngine.applyDiceRules(
            roll.rolls,
            context.diceRules ?? [],
            "DAMAGE_ROLL",
            {
              activeStates:
                activeStates.length > 0 ? activeStates : context.activeStates ?? [],
              sides: Number.parseInt(baseDice.split("d")[1] ?? "6", 10),
              rollFn: (sides) =>
                DiceEngine.rollDigital(`1d${sides}`).total,
            },
          );

          const total = appliedRolls.reduce((sum, value) => sum + value, 0);
          rollResults.push({
            total,
            rolls: appliedRolls,
            modifier: roll.modifier,
            target: "DAMAGE_ROLL",
            damageType: segment.damageType,
          });
        }

        return { ...ok, rollResults };
      }

      case "save": {
        const saveRoll = DiceEngine.rollDigital("1d20");
        const appliedRolls = DiceEngine.applyDiceRules(
          saveRoll.rolls,
          context.diceRules ?? [],
          "SAVING_THROW",
          {
            activeStates:
              activeStates.length > 0 ? activeStates : context.activeStates ?? [],
            sides: 20,
            rollFn: (sides) => DiceEngine.rollDigital(`1d${sides}`).total,
          },
        );

        const total = appliedRolls.reduce((sum, value) => sum + value, 0);

        return {
          ...ok,
          rollResults: [
            {
              total,
              rolls: appliedRolls,
              modifier: saveRoll.modifier,
              target: "SAVING_THROW",
              ...(effect.damage?.[0]?.damageType !== undefined
                ? { damageType: effect.damage[0].damageType }
                : {}),
            },
          ],
        };
      }

      default:
        return ok;
    }
  }

  /**
   * Validates the whole bill, then pays it.
   *
   * The payload arrives from the client, so it is treated as a request rather
   * than an instruction: each entry has to correspond to something the action
   * actually declared, and an ammunition pick has to be ammunition the weapon
   * can fire. Otherwise a crafted payload could shoot for free, or spend a
   * healing potion as an arrow.
   */
  private static settleCosts(
    action: ActionGrant,
    requested: ConsumedResource[],
    context: ActionExecutionContext,
  ): ActionResult {
    const pools = requested.filter((cost) => cost.type === "trait_pool");
    const stacks = requested.filter(
      (cost) => cost.type === "inventory_instance",
    );

    // region validate

    for (const cost of requested) {
      if (cost.amount <= 0) return fail("unrequested_cost", cost.id);
    }

    // a pool cost is only legitimate if this action declared it
    for (const cost of pools) {
      if (cost.id !== action.consumesResource) {
        return fail("unrequested_cost", cost.id);
      }
    }

    if (action.consumesResource && pools.length === 0) {
      // the action's own declaration stands in for an unstated pick
      pools.push({
        type: "trait_pool",
        id: action.consumesResource,
        amount: 1,
      });
    }

    if (action.consumesAmmo) {
      if (!context.inventoryLedger) return fail("no_ledger");
      if (stacks.length === 0) return fail("ammo_not_selected");
    }

    // an unrequested stack cost has nothing to justify it
    if (!action.consumesAmmo && stacks.length > 0) {
      return fail("unrequested_cost", stacks[0]?.id);
    }

    for (const cost of stacks) {
      const ledger = context.inventoryLedger;
      if (!ledger) return fail("no_ledger", cost.id);

      const stack = ledger.getStack(cost.id);
      if (!stack) return fail("missing_stack", cost.id);
      if (stack.quantity < cost.amount) {
        return fail("insufficient_stack", cost.id);
      }

      // the chosen stack has to actually be ammunition this weapon fires
      const definition = resolveItemDefinition(stack.itemId, context.snapshot);
      if (!definition || definition.ammoTag !== action.consumesAmmo) {
        return fail("wrong_ammo", cost.id);
      }
    }

    // endregion

    // region commit
    //
    // pools go first. ResourceManager checks and spends in the same call, so
    // its failure is only discoverable by trying, whereas the stacks above are
    // fully validated already. Settling the unpredictable cost first means a
    // failure here has never touched the inventory, and the only thing needing
    // an unwind is other pools — which restore in memory.

    const spentPools: ConsumedResource[] = [];

    for (const cost of pools) {
      if (context.resourceManager.consume(cost.id, cost.amount)) {
        spentPools.push(cost);
        continue;
      }

      for (const spent of spentPools) {
        context.resourceManager.restore(spent.id, spent.amount);
      }

      return fail("insufficient_resource", cost.id);
    }

    // validated above, so these cannot fail and nothing after them can
    for (const cost of stacks) {
      context.inventoryLedger?.consumeStack(cost.id, cost.amount);
    }

    // endregion

    return ok;
  }
}
