import type {
  ActionGrant,
  DamageType,
  DiceRule,
  EngineEvent,
  TriggerGrant,
} from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";
import type { CombatContextManager } from "../calculators/combatContext.js";
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
import { createSummonActorInstances } from "../rules/summonActorDictionary.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

export type ActionFailureReason =
  | "insufficient_resource"
  | "action_unavailable"
  | "bonus_action_unavailable"
  | "reaction_unavailable"
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
  label?: string;
  summary?: string;
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
  combatContext?: CombatContextManager;
  /** Required only for actions that spend ammunition. */
  inventoryLedger?: InventoryLedger;
  snapshot?: RuleSnapshotLookup;
  activeStates?: string[];
  diceRules?: DiceRule[];
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

const getStatePredicate = (
  effect: ActionGrant["effect"],
): {
  requiredStates: string[];
  forbiddenStates: string[];
} => {
  const topLevelRequiredStates =
    "requiredStates" in effect && Array.isArray(effect.requiredStates)
      ? effect.requiredStates
      : [];
  const topLevelForbiddenStates =
    "forbiddenStates" in effect && Array.isArray(effect.forbiddenStates)
      ? effect.forbiddenStates
      : [];

  const predicateGroup =
    "predicates" in effect &&
    effect.predicates &&
    typeof effect.predicates === "object"
      ? effect.predicates
      : undefined;

  const requiredStates = [
    ...topLevelRequiredStates,
    ...(predicateGroup?.requiredStates ?? []),
  ];
  const forbiddenStates = [
    ...topLevelForbiddenStates,
    ...(predicateGroup?.forbiddenStates ?? []),
  ];

  return { requiredStates, forbiddenStates };
};

const hasStatePredicate = (effect: ActionGrant["effect"]): boolean => {
  const { requiredStates, forbiddenStates } = getStatePredicate(effect);
  return requiredStates.length > 0 || forbiddenStates.length > 0;
};

const matchesStatePredicate = (
  effect: ActionGrant["effect"],
  activeStates: string[],
): boolean => {
  const { requiredStates, forbiddenStates } = getStatePredicate(effect);

  const meetsRequired = requiredStates.every((state) =>
    activeStates.includes(state),
  );
  const hasForbidden = forbiddenStates.some((state) =>
    activeStates.includes(state),
  );

  return meetsRequired && !hasForbidden;
};

const activationFailureReason = (
  activation: ActionGrant["activation"],
): ActionFailureReason | null => {
  switch (activation) {
    case "action":
      return "action_unavailable";
    case "bonus_action":
      return "bonus_action_unavailable";
    case "reaction":
      return "reaction_unavailable";
    default:
      return null;
  }
};

const spendsCombatEconomy = (activation: ActionGrant["activation"]): boolean =>
  activation === "action" ||
  activation === "bonus_action" ||
  activation === "reaction";

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
        : (context.activeStates ?? []);

    if (
      hasStatePredicate(action.effect) &&
      !matchesStatePredicate(action.effect, activeStates)
    ) {
      return ok;
    }

    // 1 - settle every cost, or none of them
    const settlement = this.settleCosts(action, requested, context);
    if (!settlement.executed) return settlement;

    // 2 - route the effect to correct handler
    return this.executeEffect(
      action.effect,
      action,
      context,
      payload.activeStates,
    );
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

  private static resolveTargetRoll(
    roll: {
      total: number;
      rolls: number[];
      modifier: number;
    },
    target: "DAMAGE_ROLL" | "ATTACK_ROLL" | "SAVING_THROW" | "ABILITY_CHECK",
    context: ActionExecutionContext,
    activeStates: string[] = [],
    sides: number,
    requiredDamageType?: DamageType,
  ) {
    return DiceEngine.applyDiceRulesToRollResult(
      roll,
      context.diceRules ?? [],
      target,
      {
        activeStates,
        sides,
        ...(requiredDamageType !== undefined ? { requiredDamageType } : {}),
        rollFn: (nextSides) => DiceEngine.rollDigital(`1d${nextSides}`).total,
      },
    );
  }

  private static executeEffect(
    effect: ActionGrant["effect"],
    action: ActionGrant,
    context: ActionExecutionContext,
    activeStates: string[] = [],
  ): ActionResult {
    if (hasStatePredicate(effect)) {
      const resolvedActiveStates =
        activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
      if (!matchesStatePredicate(effect, resolvedActiveStates)) {
        return ok;
      }
    }

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
        const resolvedActiveStates =
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []);
        const attackBonus = effect.attackBonus ?? 0;
        const damageBonus = effect.damageBonus ?? 0;

        const attackRoll = DiceEngine.rollDigital("1d20");
        const isCriticalHit = attackRoll.rolls[0] === 20;
        const resolvedAttackRoll = this.resolveTargetRoll(
          attackRoll,
          "ATTACK_ROLL",
          context,
          resolvedActiveStates,
          20,
        );

        rollResults.push({
          total: resolvedAttackRoll.total + attackBonus,
          rolls: resolvedAttackRoll.rolls,
          modifier: attackBonus,
          target: "ATTACK_ROLL",
        });

        for (const [index, segment] of damageSegments.entries()) {
          const baseDice = segment.baseDice;
          const roll =
            segment.maximized ||
            (isCriticalHit && effect.criticalDamageMaximized)
              ? DiceEngine.rollMaximized(baseDice)
              : DiceEngine.rollDigital(baseDice);
          const resolvedRoll = this.resolveTargetRoll(
            roll,
            "DAMAGE_ROLL",
            context,
            resolvedActiveStates,
            DiceEngine.parse(baseDice).sides,
            segment.damageType,
          );

          const total = resolvedRoll.total + (index === 0 ? damageBonus : 0);
          rollResults.push({
            total,
            rolls: resolvedRoll.rolls,
            modifier: index === 0 ? damageBonus : roll.modifier,
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

        if (
          effect.maxActive !== undefined &&
          activeSummons.length >= effect.maxActive
        ) {
          return fail("summon_limit_reached");
        }

        const effectInstanceId = `effect_${generateId()}`;
        const summonEntities = createSummonActorInstances(
          effectInstanceId,
          undefined,
          effect.entityTemplateIds,
        );

        const newEffect: ActiveEffect = {
          instanceId: effectInstanceId,
          sourceName: action.name,
          durationType:
            effect.durationHours !== undefined ? "rounds" : "manual",
          durationRemaining:
            effect.durationHours !== undefined
              ? Math.max(1, Math.ceil((effect.durationHours * 60) / 24))
              : undefined,
          isSelfConcentration: false,
          modifiers: [],
          grantedStates: [...effect.entityTemplateIds],
          kind: "summon",
          summonEntities: summonEntities.map(
            ({ templateId, displayLabel }) => ({
              templateId,
              label: displayLabel,
            }),
          ),
        };

        if (effect.durationHours !== undefined) {
          newEffect.durationHours = effect.durationHours;
        }

        context.effectManager.addEffect(newEffect);
        context.effectManager.addActors(summonEntities);
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
          const roll = segment.maximized
            ? DiceEngine.rollMaximized(baseDice)
            : DiceEngine.rollDigital(baseDice);
          const resolvedRoll = this.resolveTargetRoll(
            roll,
            "DAMAGE_ROLL",
            context,
            activeStates.length > 0
              ? activeStates
              : (context.activeStates ?? []),
            DiceEngine.parse(baseDice).sides,
            segment.damageType,
          );

          const total = resolvedRoll.total;
          rollResults.push({
            total,
            rolls: resolvedRoll.rolls,
            modifier: roll.modifier,
            target: "DAMAGE_ROLL",
            damageType: segment.damageType,
          });
        }

        return { ...ok, rollResults };
      }

      case "save": {
        const saveRoll = DiceEngine.rollDigital("1d20");
        const resolvedRoll = this.resolveTargetRoll(
          saveRoll,
          "SAVING_THROW",
          context,
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []),
          20,
        );

        const total = resolvedRoll.total;

        return {
          ...ok,
          rollResults: [
            {
              total,
              rolls: resolvedRoll.rolls,
              modifier: saveRoll.modifier,
              target: "SAVING_THROW",
              ...(effect.damage?.[0]?.damageType !== undefined
                ? { damageType: effect.damage[0].damageType }
                : {}),
            },
          ],
        };
      }

      case "ability_check": {
        const abilityCheckRoll = DiceEngine.rollDigital("1d20");
        const resolvedRoll = this.resolveTargetRoll(
          abilityCheckRoll,
          "ABILITY_CHECK",
          context,
          activeStates.length > 0 ? activeStates : (context.activeStates ?? []),
          20,
        );

        const total = resolvedRoll.total;

        return {
          ...ok,
          rollResults: [
            {
              total,
              rolls: resolvedRoll.rolls,
              modifier: abilityCheckRoll.modifier,
              target: "ABILITY_CHECK",
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
    let spentActivation: ActionGrant["activation"] | null = null;

    if (
      spendsCombatEconomy(action.activation) &&
      context.combatContext?.getContext().inCombat
    ) {
      let activationSpent = false;

      switch (action.activation) {
        case "action":
          activationSpent = context.combatContext.spendAction(action.id);
          break;
        case "bonus_action":
          activationSpent = context.combatContext.spendBonusAction(action.id);
          break;
        case "reaction":
          activationSpent = context.combatContext.spendReaction(action.id);
          break;
      }

      if (!activationSpent) {
        return fail(
          activationFailureReason(action.activation) ?? "unrequested_cost",
          action.id,
        );
      }

      spentActivation = action.activation;
    }

    for (const cost of pools) {
      if (context.resourceManager.consume(cost.id, cost.amount)) {
        spentPools.push(cost);
        continue;
      }

      if (spentActivation && context.combatContext) {
        switch (spentActivation) {
          case "action":
            context.combatContext.refundAction();
            break;
          case "bonus_action":
            context.combatContext.refundBonusAction();
            break;
          case "reaction":
            context.combatContext.refundReaction();
            break;
        }
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
