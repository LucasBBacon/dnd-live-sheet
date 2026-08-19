import { beforeEach, describe, expect, it } from "vitest";
import {
  CombatContextManager,
  EffectManager,
  ResourceManager,
} from "@project/engine";
import type { CharacterSave } from "@project/shared";
import { resolvePlayerTurn, type TurnRuntime } from "../turnResolution.js";

const save: CharacterSave = {
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: {},
  hp: { current: 10, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
};

const identity = { characterId: "char_1", requestId: "req_1" };

describe("resolvePlayerTurn", () => {
  let runtime: TurnRuntime;

  const seed = (
    state: string,
    durationType: "turn_start" | "turn_end" | "manual",
  ) => {
    runtime.effectManager.addEffect({
      instanceId: `effect_${state}`,
      sourceName: state,
      durationType,
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: [state],
    });
  };

  const grantedStatesIn = (
    payload: ReturnType<typeof resolvePlayerTurn>,
  ): string[] => payload.effects.flatMap((effect) => effect.grantedStates);

  beforeEach(() => {
    const combatContext = new CombatContextManager();
    combatContext.beginCombat();

    runtime = {
      save,
      effectManager: new EffectManager(),
      resourceManager: new ResourceManager(),
      combatContext,
    };
  });

  it("drops an end-of-turn effect from the effects it sends back", () => {
    // the regression test for the clobbering bug: the server is the authority,
    // so its own effect list must expire, or the next sync resurrects the buff
    seed("status_reckless_attack", "turn_end");

    const payload = resolvePlayerTurn(runtime, "ended", identity);

    expect(grantedStatesIn(payload)).not.toContain("status_reckless_attack");
  });

  it("keeps an until-next-turn effect when the turn merely ends", () => {
    seed("status_attacks_against_have_advantage", "turn_start");

    const payload = resolvePlayerTurn(runtime, "ended", identity);

    expect(grantedStatesIn(payload)).toContain(
      "status_attacks_against_have_advantage",
    );
  });

  it("drops the until-next-turn effect once the next turn starts", () => {
    seed("status_attacks_against_have_advantage", "turn_start");

    resolvePlayerTurn(runtime, "ended", identity);
    const payload = resolvePlayerTurn(runtime, "started", identity);

    expect(grantedStatesIn(payload)).not.toContain(
      "status_attacks_against_have_advantage",
    );
  });

  it("leaves a manual effect such as Rage running across the whole cycle", () => {
    seed("status_raging", "manual");

    resolvePlayerTurn(runtime, "ended", identity);
    const payload = resolvePlayerTurn(runtime, "started", identity);

    expect(grantedStatesIn(payload)).toContain("status_raging");
  });

  it("reports the expiry in the active states the sheet adopts", () => {
    seed("status_reckless_attack", "turn_end");

    const payload = resolvePlayerTurn(runtime, "ended", identity);

    expect(payload.activeStates).not.toContain("status_reckless_attack");
  });

  it("refreshes the action economy when the turn starts", () => {
    runtime.combatContext.beginTurn({ kind: "player" });
    runtime.combatContext.spendAction("action_something");

    const payload = resolvePlayerTurn(runtime, "started", identity);

    expect(payload.combatContext.economy.actionAvailable).toBe(true);
  });

  it("leaves the economy spent when the turn merely ends", () => {
    runtime.combatContext.beginTurn({ kind: "player" });
    runtime.combatContext.spendAction("action_something");

    const payload = resolvePlayerTurn(runtime, "ended", identity);

    expect(payload.combatContext.economy.actionAvailable).toBe(false);
  });

  it("names which transition it applied", () => {
    expect(resolvePlayerTurn(runtime, "started", identity).transition).toBe(
      "started",
    );
    expect(resolvePlayerTurn(runtime, "ended", identity).transition).toBe(
      "ended",
    );
  });

  it("echoes the identity so the sheet can match the reply to its request", () => {
    const payload = resolvePlayerTurn(runtime, "started", identity);

    expect(payload.characterId).toBe("char_1");
    expect(payload.requestId).toBe("req_1");
  });

  it("mutates the runtime it was given, so the next call sees the new state", () => {
    seed("status_reckless_attack", "turn_end");

    resolvePlayerTurn(runtime, "ended", identity);

    expect(runtime.effectManager.getActiveStates()).not.toContain(
      "status_reckless_attack",
    );
  });
});
