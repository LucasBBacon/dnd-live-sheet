import { beforeEach, describe, expect, it } from "vitest";
import type { ActionGrant, TriggerGrant } from "@project/shared";
import { TurnLifecycle } from "../turnLifecycle.js";
import { CombatContextManager } from "../../calculators/combatContext.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

/** An action that raises a flag effect, for observing that a trigger fired. */
const raiseEffect = (
  id: string,
  state: string,
  durationType: "turn_start" | "turn_end" | "manual",
): ActionGrant => ({
  id,
  name: state,
  activation: "special",
  effect: {
    type: "apply_effect",
    effectName: state,
    durationType,
    states: [state],
    modifiers: [],
    isSelfConcentration: false,
    requiredStates: [],
    forbiddenStates: [],
  },
});

describe("TurnLifecycle", () => {
  let effectManager: EffectManager;
  let resourceManager: ResourceManager;
  let combatContext: CombatContextManager;

  const seed = (
    state: string,
    durationType: "turn_start" | "turn_end" | "manual",
  ) => {
    effectManager.addEffect({
      instanceId: `effect_${state}`,
      sourceName: state,
      durationType,
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: [state],
    });
  };

  const context = (
    triggerGrants: TriggerGrant[] = [],
    actions: ActionGrant[] = [],
  ) => ({
    effectManager,
    resourceManager,
    combatContext,
    triggerGrants,
    actionLookup: Object.fromEntries(
      actions.map((action) => [action.id, action]),
    ),
  });

  beforeEach(() => {
    effectManager = new EffectManager();
    resourceManager = new ResourceManager();
    combatContext = new CombatContextManager();
    combatContext.beginCombat();
  });

  describe("beginPlayerTurn", () => {
    it("expires an effect that lasts until the start of the next turn", () => {
      seed("status_attacks_against_have_advantage", "turn_start");

      TurnLifecycle.beginPlayerTurn(context());

      expect(effectManager.getActiveStates()).not.toContain(
        "status_attacks_against_have_advantage",
      );
    });

    it("leaves an end-of-turn effect alone", () => {
      seed("status_reckless_attack", "turn_end");

      TurnLifecycle.beginPlayerTurn(context());

      expect(effectManager.getActiveStates()).toContain(
        "status_reckless_attack",
      );
    });

    it("leaves a manual effect such as Rage alone", () => {
      seed("status_raging", "manual");

      TurnLifecycle.beginPlayerTurn(context());

      expect(effectManager.getActiveStates()).toContain("status_raging");
    });

    it("refreshes the action economy", () => {
      combatContext.beginTurn({ kind: "player" });
      combatContext.spendAction("action_something");
      combatContext.spendBonusAction("action_something_else");

      const result = TurnLifecycle.beginPlayerTurn(context());

      expect(result.combatContext.economy.actionAvailable).toBe(true);
      expect(result.combatContext.economy.bonusActionAvailable).toBe(true);
      expect(result.combatContext.economy.reactionAvailable).toBe(true);
    });

    it("advances the round number", () => {
      // asserted as an increment rather than an absolute: where the count
      // starts is CombatContextManager's contract, pinned in its own suite
      const before = combatContext.getContext().roundNumber ?? 0;

      const result = TurnLifecycle.beginPlayerTurn(context());

      expect(result.combatContext.roundNumber).toBe(before + 1);
    });

    it("dispatches the start-of-turn event to authored triggers", () => {
      const action = raiseEffect("action_ward", "status_warded", "manual");

      TurnLifecycle.beginPlayerTurn(
        context(
          [{ listenFor: "ON_START_OF_TURN", executeAction: action.id }],
          [action],
        ),
      );

      expect(effectManager.getActiveStates()).toContain("status_warded");
    });

    it("expires before dispatching, so a trigger's own fresh effect survives", () => {
      const action = raiseEffect("action_ward", "status_warded", "turn_start");

      TurnLifecycle.beginPlayerTurn(
        context(
          [{ listenFor: "ON_START_OF_TURN", executeAction: action.id }],
          [action],
        ),
      );

      expect(effectManager.getActiveStates()).toContain("status_warded");
    });

    it("ignores triggers listening for a different event", () => {
      const action = raiseEffect("action_ward", "status_warded", "manual");

      TurnLifecycle.beginPlayerTurn(
        context(
          [{ listenFor: "ON_END_OF_TURN", executeAction: action.id }],
          [action],
        ),
      );

      expect(effectManager.getActiveStates()).not.toContain("status_warded");
    });
  });

  describe("endPlayerTurn", () => {
    it("expires an effect that lasts until the end of the turn", () => {
      seed("status_reckless_attack", "turn_end");

      TurnLifecycle.endPlayerTurn(context());

      expect(effectManager.getActiveStates()).not.toContain(
        "status_reckless_attack",
      );
    });

    it("carries an until-next-turn effect past the end of this one", () => {
      seed("status_attacks_against_have_advantage", "turn_start");

      TurnLifecycle.endPlayerTurn(context());

      expect(effectManager.getActiveStates()).toContain(
        "status_attacks_against_have_advantage",
      );
    });

    it("dispatches the end-of-turn event to authored triggers", () => {
      const action = raiseEffect("action_regen", "status_regenerated", "manual");

      TurnLifecycle.endPlayerTurn(
        context(
          [{ listenFor: "ON_END_OF_TURN", executeAction: action.id }],
          [action],
        ),
      );

      expect(effectManager.getActiveStates()).toContain("status_regenerated");
    });

    it("expires before dispatching, so a trigger's own fresh effect survives", () => {
      const action = raiseEffect("action_regen", "status_regenerated", "turn_end");

      TurnLifecycle.endPlayerTurn(
        context(
          [{ listenFor: "ON_END_OF_TURN", executeAction: action.id }],
          [action],
        ),
      );

      expect(effectManager.getActiveStates()).toContain("status_regenerated");
    });

    it("clears the active turn owner", () => {
      combatContext.beginTurn({ kind: "player" });

      const result = TurnLifecycle.endPlayerTurn(context());

      expect(result.combatContext.activeTurnOwner).toBeNull();
    });

    it("does not refresh the economy, which belongs to the next turn's start", () => {
      combatContext.beginTurn({ kind: "player" });
      combatContext.spendAction("action_something");

      const result = TurnLifecycle.endPlayerTurn(context());

      expect(result.combatContext.economy.actionAvailable).toBe(false);
    });
  });

  describe("a full Reckless Attack cycle", () => {
    it("keeps both halves alive through the turn they were declared on", () => {
      seed("status_reckless_attack", "turn_end");
      seed("status_attacks_against_have_advantage", "turn_start");

      const states = effectManager.getActiveStates();

      expect(states).toContain("status_reckless_attack");
      expect(states).toContain("status_attacks_against_have_advantage");
    });

    it("drops the self buff at end of turn but keeps the exposure", () => {
      seed("status_reckless_attack", "turn_end");
      seed("status_attacks_against_have_advantage", "turn_start");

      TurnLifecycle.endPlayerTurn(context());

      const states = effectManager.getActiveStates();
      expect(states).not.toContain("status_reckless_attack");
      expect(states).toContain("status_attacks_against_have_advantage");
    });

    it("drops the exposure at the start of the next turn", () => {
      seed("status_reckless_attack", "turn_end");
      seed("status_attacks_against_have_advantage", "turn_start");

      TurnLifecycle.endPlayerTurn(context());
      TurnLifecycle.beginPlayerTurn(context());

      expect(effectManager.getActiveStates()).toEqual([]);
    });
  });
});
