import { beforeEach, describe, expect, it } from "vitest";
import { EffectManager } from "../effects.js";
import type { ActiveEffect } from "../effects.js";
import type { RuntimeModifier } from "@project/shared";

let idCounter = 0;

const makeEffect = (overrides: Partial<ActiveEffect> = {}): ActiveEffect => ({
  instanceId: `effect_${++idCounter}`,
  sourceName: "Test Effect",
  durationType: "manual",
  durationRemaining: undefined,
  isSelfConcentration: false,
  modifiers: [],
  grantedStates: [],
  ...overrides,
});

const makeMod = (overrides: Partial<RuntimeModifier> = {}): RuntimeModifier => ({
  id: "mod_1",
  target: "ARMOR_CLASS",
  type: "add",
  value: 1,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Mod",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

let manager: EffectManager;

beforeEach(() => {
  manager = new EffectManager();
});

// #region addEffect

describe("EffectManager.addEffect", () => {
  it("stores an effect so its states and modifiers become active", () => {
    manager.addEffect(
      makeEffect({
        grantedStates: ["blessed"],
        modifiers: [makeMod({ sourceName: "Bless" })],
      }),
    );

    expect(manager.getActiveStates()).toEqual(["blessed"]);
    expect(manager.getActiveModifiers()).toHaveLength(1);
  });

  it("does not drop an existing concentration effect when the new effect is not self-concentration", () => {
    manager.addEffect(
      makeEffect({
        isSelfConcentration: true,
        grantedStates: ["concentrating_on_a"],
      }),
    );
    manager.addEffect(makeEffect({ grantedStates: ["b_active"] }));

    expect(manager.getActiveStates()).toEqual([
      "concentrating_on_a",
      "b_active",
    ]);
  });

  it("drops an existing concentration effect when a new concentration effect is added (5e concentration rule)", () => {
    manager.addEffect(
      makeEffect({
        isSelfConcentration: true,
        grantedStates: ["concentrating_on_a"],
      }),
    );
    manager.addEffect(
      makeEffect({
        isSelfConcentration: true,
        grantedStates: ["concentrating_on_b"],
      }),
    );

    expect(manager.getActiveStates()).toEqual(["concentrating_on_b"]);
  });

  it("does not drop unrelated non-concentration effects when a new concentration effect is added", () => {
    manager.addEffect(makeEffect({ grantedStates: ["passive_buff"] }));
    manager.addEffect(
      makeEffect({
        isSelfConcentration: true,
        grantedStates: ["concentrating_on_b"],
      }),
    );

    expect(manager.getActiveStates()).toEqual([
      "passive_buff",
      "concentrating_on_b",
    ]);
  });

  it("overwrites an existing effect that shares the same instanceId", () => {
    manager.addEffect(
      makeEffect({ instanceId: "fixed_id", grantedStates: ["v1"] }),
    );
    manager.addEffect(
      makeEffect({ instanceId: "fixed_id", grantedStates: ["v2"] }),
    );

    expect(manager.getActiveStates()).toEqual(["v2"]);
  });
});

// #endregion

// #region removeEffect

describe("EffectManager.removeEffect", () => {
  it("removes the effect matching the given instanceId", () => {
    manager.addEffect(
      makeEffect({ instanceId: "e1", grantedStates: ["x"] }),
    );

    manager.removeEffect("e1");

    expect(manager.getActiveStates()).toEqual([]);
  });

  it("is a no-op when the instanceId does not match any active effect", () => {
    manager.addEffect(
      makeEffect({ instanceId: "e1", grantedStates: ["x"] }),
    );

    expect(() => manager.removeEffect("does_not_exist")).not.toThrow();
    expect(manager.getActiveStates()).toEqual(["x"]);
  });
});

describe("EffectManager.removeEffectsByTag", () => {
  it("removes all matching tagged effects and their actors", () => {
    manager.addEffect({
      ...makeEffect({ instanceId: "rage_1", grantedStates: ["status_raging"] }),
      effectTag: "rage",
    });
    manager.addEffect({
      ...makeEffect({ instanceId: "rage_2", grantedStates: ["status_raging"] }),
      effectTag: "rage",
    });
    manager.addEffect(
      makeEffect({ instanceId: "other", grantedStates: ["other_state"] }),
    );

    expect(manager.removeEffectsByTag("rage")).toBe(2);
    expect(manager.getActiveStates()).toEqual(["other_state"]);
  });

  it("is a no-op when no effect carries the tag", () => {
    expect(manager.removeEffectsByTag("missing")).toBe(0);
  });
});

// #endregion

// #region dropConcentration

describe("EffectManager.dropConcentration", () => {
  it("removes the active concentration effect but leaves other effects active", () => {
    manager.addEffect(
      makeEffect({
        isSelfConcentration: true,
        grantedStates: ["concentrating"],
      }),
    );
    manager.addEffect(makeEffect({ grantedStates: ["passive_buff"] }));

    manager.dropConcentration();

    expect(manager.getActiveStates()).toEqual(["passive_buff"]);
  });

  it("is a no-op when no concentration effect is active", () => {
    manager.addEffect(makeEffect({ grantedStates: ["passive_buff"] }));

    expect(() => manager.dropConcentration()).not.toThrow();
    expect(manager.getActiveStates()).toEqual(["passive_buff"]);
  });
});

// #endregion

// #region tickTurnStart

describe("EffectManager.tickTurnStart", () => {
  it("removes turn_start effects unconditionally", () => {
    manager.addEffect(
      makeEffect({ durationType: "turn_start", grantedStates: ["x"] }),
    );

    manager.tickTurnStart();

    expect(manager.getActiveStates()).toEqual([]);
  });

  it("decrements a rounds effect's remaining duration without removing it while it stays positive", () => {
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 2,
        grantedStates: ["rounds_active"],
      }),
    );

    manager.tickTurnStart();

    expect(manager.getActiveStates()).toEqual(["rounds_active"]);
  });

  it("removes a rounds effect once its remaining duration reaches zero", () => {
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 1,
        grantedStates: ["rounds_active"],
      }),
    );

    manager.tickTurnStart();

    expect(manager.getActiveStates()).toEqual([]);
  });

  it("leaves a rounds effect with an undefined durationRemaining untouched", () => {
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: undefined,
        grantedStates: ["rounds_indefinite"],
      }),
    );

    manager.tickTurnStart();
    manager.tickTurnStart();

    expect(manager.getActiveStates()).toEqual(["rounds_indefinite"]);
  });

  it("leaves turn_end, rest_short, rest_long, and manual effects untouched", () => {
    manager.addEffect(
      makeEffect({ durationType: "turn_end", grantedStates: ["turn_end"] }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rest_short",
        grantedStates: ["rest_short"],
      }),
    );
    manager.addEffect(
      makeEffect({ durationType: "rest_long", grantedStates: ["rest_long"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "manual", grantedStates: ["manual"] }),
    );

    manager.tickTurnStart();

    expect(manager.getActiveStates()).toEqual([
      "turn_end",
      "rest_short",
      "rest_long",
      "manual",
    ]);
  });

  it("ticks down a rounds effect over multiple turn starts, keeping other durations independent", () => {
    manager.addEffect(
      makeEffect({ durationType: "turn_start", grantedStates: ["a"] }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 2,
        grantedStates: ["b"],
      }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 1,
        grantedStates: ["c"],
      }),
    );
    manager.addEffect(
      makeEffect({ durationType: "manual", grantedStates: ["d"] }),
    );

    manager.tickTurnStart();
    // "a" (turn_start) is gone immediately, "c" (rounds: 1 -> 0) is gone,
    // "b" (rounds: 2 -> 1) and "d" (manual) survive.
    expect(manager.getActiveStates()).toEqual(["b", "d"]);

    manager.tickTurnStart();
    // "b" (rounds: 1 -> 0) is now gone too.
    expect(manager.getActiveStates()).toEqual(["d"]);
  });
});

// #endregion

// #region tickTurnEnd

describe("EffectManager.tickTurnEnd", () => {
  it("removes turn_end effects", () => {
    manager.addEffect(
      makeEffect({ durationType: "turn_end", grantedStates: ["x"] }),
    );

    manager.tickTurnEnd();

    expect(manager.getActiveStates()).toEqual([]);
  });

  it("does not decrement or remove rounds effects", () => {
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 1,
        grantedStates: ["rounds_active"],
      }),
    );

    manager.tickTurnEnd();
    manager.tickTurnEnd();
    expect(manager.getActiveStates()).toEqual(["rounds_active"]);

    // a subsequent turn start proves the counter was never touched by
    // tickTurnEnd: it still had exactly 1 remaining, so one decrement removes it.
    manager.tickTurnStart();
    expect(manager.getActiveStates()).toEqual([]);
  });

  it("leaves turn_start, rest_short, rest_long, and manual effects untouched", () => {
    manager.addEffect(
      makeEffect({ durationType: "turn_start", grantedStates: ["turn_start"] }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rest_short",
        grantedStates: ["rest_short"],
      }),
    );
    manager.addEffect(
      makeEffect({ durationType: "rest_long", grantedStates: ["rest_long"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "manual", grantedStates: ["manual"] }),
    );

    manager.tickTurnEnd();

    expect(manager.getActiveStates()).toEqual([
      "turn_start",
      "rest_short",
      "rest_long",
      "manual",
    ]);
  });
});

// #endregion

// #region tickRest

describe("EffectManager.tickRest", () => {
  it("removes only rest_short effects on a short rest, leaving every other duration type", () => {
    manager.addEffect(
      makeEffect({ durationType: "rest_short", grantedStates: ["rest_short"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "rest_long", grantedStates: ["rest_long"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "manual", grantedStates: ["manual"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "turn_start", grantedStates: ["turn_start"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "turn_end", grantedStates: ["turn_end"] }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 3,
        grantedStates: ["rounds"],
      }),
    );

    manager.tickRest(false);

    expect(manager.getActiveStates()).toEqual([
      "rest_long",
      "manual",
      "turn_start",
      "turn_end",
      "rounds",
    ]);
  });

  it("removes rest_short and rest_long effects on a long rest, leaving manual and rounds effects alone", () => {
    manager.addEffect(
      makeEffect({ durationType: "rest_short", grantedStates: ["rest_short"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "rest_long", grantedStates: ["rest_long"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "manual", grantedStates: ["manual"] }),
    );
    manager.addEffect(
      makeEffect({
        durationType: "rounds",
        durationRemaining: 3,
        grantedStates: ["rounds"],
      }),
    );
    manager.addEffect(
      makeEffect({ durationType: "turn_start", grantedStates: ["turn_start"] }),
    );
    manager.addEffect(
      makeEffect({ durationType: "turn_end", grantedStates: ["turn_end"] }),
    );

    manager.tickRest(true);

    expect(manager.getActiveStates()).toEqual([
      "manual",
      "rounds",
      "turn_start",
      "turn_end",
    ]);
  });

  it("does not remove a rest_long effect on a short rest", () => {
    manager.addEffect(
      makeEffect({ durationType: "rest_long", grantedStates: ["rest_long"] }),
    );

    manager.tickRest(false);

    expect(manager.getActiveStates()).toEqual(["rest_long"]);
  });
});

// #endregion

// #region getActiveModifiers

describe("EffectManager.getActiveModifiers", () => {
  it("returns an empty array when no effects are active", () => {
    expect(manager.getActiveModifiers()).toEqual([]);
  });

  it("flattens an effect's modifiers and stamps the effect's instanceId onto each one", () => {
    const mod = makeMod({ sourceName: "Bless", value: 2 });
    manager.addEffect(
      makeEffect({ instanceId: "effect_bless", modifiers: [mod] }),
    );

    expect(manager.getActiveModifiers()).toEqual([
      { ...mod, instanceId: "effect_bless" },
    ]);
  });

  it("combines modifiers from multiple active effects, preserving insertion order", () => {
    const modA = makeMod({ sourceName: "Bless", value: 2 });
    const modB = makeMod({ sourceName: "Rage", value: 3 });
    manager.addEffect(
      makeEffect({ instanceId: "effect_a", modifiers: [modA] }),
    );
    manager.addEffect(
      makeEffect({ instanceId: "effect_b", modifiers: [modB] }),
    );

    expect(manager.getActiveModifiers()).toEqual([
      { ...modA, instanceId: "effect_a" },
      { ...modB, instanceId: "effect_b" },
    ]);
  });

  it("does not mutate the original effect's modifier objects", () => {
    const mod = makeMod({ sourceName: "Bless" });
    const effect = makeEffect({ modifiers: [mod] });
    manager.addEffect(effect);

    manager.getActiveModifiers();

    expect(effect.modifiers[0]).toBe(mod);
    expect(mod).not.toHaveProperty("instanceId");
  });
});

// #endregion

// #region getActiveStates

describe("EffectManager.getActiveStates", () => {
  it("returns an empty array when no effects are active", () => {
    expect(manager.getActiveStates()).toEqual([]);
  });

  it("deduplicates states repeated across multiple effects, preserving first-seen order", () => {
    manager.addEffect(makeEffect({ grantedStates: ["a", "b"] }));
    manager.addEffect(makeEffect({ grantedStates: ["b", "c"] }));

    expect(manager.getActiveStates()).toEqual(["a", "b", "c"]);
  });
});

// #endregion
