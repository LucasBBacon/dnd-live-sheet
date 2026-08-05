import type { ActionGrant } from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { resolveItemDefinition, type RuleSnapshotLookup } from "../rules/ruleLookup.js";
import type { InventoryLedger } from "./inventoryLedger.js";
import type { ConsumedResource, RollContextPayload } from "./rollContextBuilder.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

export type ActionFailureReason =
  | "insufficient_resource"
  | "missing_stack"
  | "insufficient_stack"
  | "wrong_ammo"
  | "ammo_not_selected"
  | "no_ledger"
  | "unrequested_cost";

export interface ActionResult {
  executed: boolean;
  reason?: ActionFailureReason;
  /** Which cost failed, for a message the player can act on. */
  offendingId?: string;
}

export interface ActionExecutionContext {
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  /** Required only for actions that spend ammunition. */
  inventoryLedger?: InventoryLedger;
  snapshot?: RuleSnapshotLookup;
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

    // 1 - settle every cost, or none of them
    const settlement = this.settleCosts(action, requested, context);
    if (!settlement.executed) return settlement;

    // 2 - route the effect to correct handler
    switch (action.effect.type) {
      case "apply_effect": {
        const blueprint = action.effect;

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
        break;
      }
      case "attack": {
        // TODO: dice rolling modal for attack
        break;
      }

      case "summon": {
        // TODO: pipeline for summons
        break;
      }

      case "macro": {
        // TODO: Implement macro actions
        break;
      }

      case "damage_rider": {
        // TODO: apply damage over time effect
        break;
      }

      case "save": {
        // TODO: save dice rolls
        break;
      }
    }

    return ok;
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
