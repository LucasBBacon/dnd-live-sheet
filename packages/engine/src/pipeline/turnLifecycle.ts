import type {
  ActionGrant,
  CombatContext,
  DiceRule,
  TriggerGrant,
} from "@project/shared";
import type { CombatContextManager } from "../calculators/combatContext.js";
import type { EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import {
  ActionResolver,
  type ActionResult,
  type ActionRollResult,
} from "./actionResolver.js";

/**
 * Everything a turn transition needs, and nothing about where it came from.
 *
 * Triggers and actions arrive already compiled rather than being resolved from
 * a save here: that keeps this unit free of the bootstrapper and the trait
 * dictionary, so it can be reasoned about - and tested - as pure turn rules.
 */
export interface TurnLifecycleContext {
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  combatContext: CombatContextManager;
  triggerGrants: TriggerGrant[];
  actionLookup: Record<string, ActionGrant>;
  activeStates?: string[];
  diceRules?: DiceRule[];
}

export interface TurnTransitionResult {
  combatContext: CombatContext;
  results: ActionResult[];
  rollResults: ActionRollResult[];
}

/**
 * What happens when a player's turn begins and ends.
 *
 * Exists as one unit because the two halves share an ordering rule that is easy
 * to get wrong in isolation: effects expire *before* the matching trigger event
 * dispatches. Ticking afterwards would sweep away an effect the trigger had
 * just raised - a start-of-turn ward would vanish the moment it appeared.
 */
export class TurnLifecycle {
  /**
   * Begins the player's turn: expire, refresh the economy, then dispatch.
   * @param context The managers and compiled trait data this turn acts on
   * @returns The updated combat context and anything the triggers rolled
   */
  public static beginPlayerTurn(
    context: TurnLifecycleContext,
  ): TurnTransitionResult {
    context.effectManager.tickTurnStart();

    // beginTurn is what refreshes action, bonus action and reaction, so it
    // runs before the dispatch - a trigger that spends a reaction on turn one
    // must not have it wiped by the refresh
    const combatContext = context.combatContext.beginTurn({ kind: "player" });

    return this.dispatch(context, "ON_START_OF_TURN", combatContext);
  }

  /**
   * Ends the player's turn: expire, dispatch, then close the turn.
   * @param context The managers and compiled trait data this turn acts on
   * @returns The updated combat context and anything the triggers rolled
   */
  public static endPlayerTurn(
    context: TurnLifecycleContext,
  ): TurnTransitionResult {
    context.effectManager.tickTurnEnd();

    const dispatched = this.dispatch(context, "ON_END_OF_TURN");

    // closing after the dispatch, so an end-of-turn trigger still runs while
    // the turn is nominally the player's. The economy is deliberately left
    // spent: it refreshes when the next turn begins, not when this one ends
    return {
      ...dispatched,
      combatContext: context.combatContext.endTurn({ kind: "player" }),
    };
  }

  private static dispatch(
    context: TurnLifecycleContext,
    eventName: "ON_START_OF_TURN" | "ON_END_OF_TURN",
    combatContext?: CombatContext,
  ): TurnTransitionResult {
    const results = ActionResolver.dispatchEvent(
      eventName,
      context.triggerGrants,
      context.actionLookup,
      {
        effectManager: context.effectManager,
        resourceManager: context.resourceManager,
        combatContext: context.combatContext,
        ...(context.activeStates !== undefined && {
          activeStates: context.activeStates,
        }),
        ...(context.diceRules !== undefined && {
          diceRules: context.diceRules,
        }),
        // a rule that fires on its own schedule should not be refused for an
        // economy the player already spent
        economyPolicy: "track",
      },
    );

    return {
      combatContext: combatContext ?? context.combatContext.getContext(),
      results,
      rollResults: results.flatMap((result) => result.rollResults ?? []),
    };
  }
}
