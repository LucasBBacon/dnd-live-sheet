import {
  costsAttack,
  costsCombatEconomy,
  type ActionGrant,
  type DamageType,
  type DiceRule,
  type EngineEvent,
  type TriggerGrant,
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
  /**
   * Set when the action ran despite its activation already being spent.
   *
   * Only possible under economyPolicy "track". The action still happened - the
   * flag exists so the sheet can say so rather than pretend the turn was legal.
   */
  economyOverdrawn?: boolean;
}

/**
 * What to do when an action costs an activation the character has already used.
 *
 * "enforce" refuses it. "track" runs it anyway and reports the overdraft, which
 * is what a live sheet wants: tables bend the economy constantly - a DM grants
 * a free action, a reaction is retconned - and a sheet that refuses becomes
 * something the player fights rather than uses.
 *
 * Policy belongs to the caller. The resolver reports; it does not decide how
 * strict the table is.
 */
export type EconomyPolicy = "enforce" | "track";

export interface ActionExecutionContext {
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  combatContext?: CombatContextManager;
  /** Required only for actions that spend ammunition. */
  inventoryLedger?: InventoryLedger;
  snapshot?: RuleSnapshotLookup;
  activeStates?: string[];
  diceRules?: DiceRule[];
  /** Defaults to "enforce", preserving strict behaviour for existing callers. */
  economyPolicy?: EconomyPolicy;
  /**
   * How many attacks one Attack action grants, from
   * DerivedStatEngine.calculateAttacksPerAction. Defaults to one.
   */
  attacksPerAction?: number;
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
    // an attack that cannot be made is an Attack action that could not be
    // afforded, so it reports as the action it would have cost
    case "action":
    case "attack":
      return "action_unavailable";
    case "bonus_action":
      return "bonus_action_unavailable";
    case "reaction":
      return "reaction_unavailable";
    default:
      return null;
  }
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
    const outcome = this.executeEffect(
      action.effect,
      action,
      context,
      payload.activeStates,
    );

    // an overdraft is settled at cost time but only meaningful once the action
    // has actually happened, so it rides out on the effect's result
    return settlement.economyOverdrawn
      ? { ...outcome, economyOverdrawn: true }
      : outcome;
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
      case "remove_effect":
        context.effectManager.removeEffectsByTag(effect.effectTag);
        return ok;
      case "apply_effect": {
        const blueprint = effect;
        const instanceId = `effect_${generateId()}`;
        const sourceName = blueprint.effectName || action.name;

        // translate static blueprint into live ActiveEffect
        const newEffect: ActiveEffect = {
          instanceId,
          sourceName,
          durationType: blueprint.durationType,
          durationRemaining: blueprint.durationRounds,
          isSelfConcentration: blueprint.isSelfConcentration,
          ...(blueprint.effectTag === undefined
            ? {}
            : { effectTag: blueprint.effectTag }),
          // an authored blueprint carries a BaseModifier, but the calculators
          // consume RuntimeModifiers: without the identity fields stamped on
          // here, every one of these would be dropped by the `!isActive` guard
          // and any that survived would attribute itself to "undefined".
          // Cloned rather than spread in place so the static pack data the
          // blueprint points at is never written through.
          modifiers: blueprint.modifiers.map((modifier, index) => ({
            ...structuredClone(modifier),
            id: `${instanceId}:${index}`,
            sourceName,
            sourceOrigin: `action:${action.id}`,
            isActive: true,
          })),
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

        // a critical hit rolls its own pool - already doubled, and already
        // carrying whatever critical-hit modifiers matched - which CombatEngine
        // resolved ahead of the roll. An action authored before critical
        // segments existed has none, and falls back to its base dice.
        const resolvedSegments =
          isCriticalHit && effect.criticalDamage?.length
            ? effect.criticalDamage
            : damageSegments;

        for (const [index, segment] of resolvedSegments.entries()) {
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
          ...(effect.effectTag === undefined
            ? {}
            : { effectTag: effect.effectTag }),
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
  /**
   * Draws one attack, taking the Attack action first if it has not been taken.
   *
   * Swinging is how a player says "I take the Attack action" - nobody declares
   * it separately at the table - so the first swing of a turn opens the
   * allowance and immediately spends one of it. Later swings only draw down.
   * @param action The attack being made, which is also what took the Attack action
   * @param context The execution context, carrying the combat context and attack count
   * @returns True if an attack was available to spend
   */
  private static settleAttack(
    action: ActionGrant,
    context: ActionExecutionContext,
  ): { spent: boolean; declared: boolean } {
    const combatContext = context.combatContext;
    if (!combatContext) return { spent: false, declared: false };

    if (combatContext.getContext().economy.attacksRemaining === null) {
      const declared = combatContext.declareAttackAction(
        action.id,
        context.attacksPerAction ?? 1,
      );

      return {
        spent: declared && combatContext.spendAttack(),
        declared,
      };
    }

    return { spent: combatContext.spendAttack(), declared: false };
  }

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
    let economyOverdrawn = false;
    // whether this swing was the one that took the Attack action, which decides
    // how far an abort has to unwind
    let attackDeclared = false;

    if (
      (costsCombatEconomy(action.activation) ||
        costsAttack(action.activation)) &&
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
        case "attack": {
          const outcome = this.settleAttack(action, context);
          activationSpent = outcome.spent;
          attackDeclared = outcome.declared;
          break;
        }
      }

      if (!activationSpent) {
        if ((context.economyPolicy ?? "enforce") === "enforce") {
          return fail(
            activationFailureReason(action.activation) ?? "unrequested_cost",
            action.id,
          );
        }

        // tracking: the action goes ahead and the sheet is told it went over.
        // spentActivation stays null deliberately - nothing was taken, so a
        // later abort has nothing to refund
        economyOverdrawn = true;
      } else {
        spentActivation = action.activation;
      }
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
          case "attack":
            // a swing that took the Attack action has to untake it, not just
            // hand back the one attack, or the player keeps an Attack action
            // they never managed to make
            if (attackDeclared) {
              context.combatContext.undoAttackAction();
              context.combatContext.refundAction();
            } else {
              context.combatContext.refundAttack();
            }
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

    return economyOverdrawn ? { ...ok, economyOverdrawn: true } : ok;
  }
}
