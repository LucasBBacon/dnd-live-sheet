import { describe, expect, it } from "vitest";
import { RestEngine } from "../rests.js";
import type { CharacterRestContext } from "../rests.js";
import { EffectManager } from "../effects.js";
import { ResourceManager } from "../resources.js";
import type { RuntimeHealthState } from "../../types/combat.js";
import type { HitDicePool } from "../../types/resources.js";

const makePool = (overrides: Partial<HitDicePool> = {}): HitDicePool => ({
  dieSize: 8,
  maxDice: 1,
  currentDice: 1,
  ...overrides,
});

const makeHealth = (
  overrides: Partial<RuntimeHealthState> = {},
): RuntimeHealthState => ({
  currentHp: 10,
  tempHp: 0,
  hitDice: {},
  ...overrides,
});

const makeContext = (
  overrides: Partial<CharacterRestContext> = {},
): CharacterRestContext => ({
  health: makeHealth(),
  maxHp: 20,
  effectManager: new EffectManager(),
  resourceManager: new ResourceManager(),
  ...overrides,
});

// #region executeShortRest

describe("RestEngine.executeShortRest", () => {
  describe("hit dice deduction", () => {
    it("deducts the spent amount from the matching hit dice pool", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: { d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 4 }) },
        }),
      });

      RestEngine.executeShortRest(context, 0, { d8: 2 });

      expect(context.health.hitDice.d8?.currentDice).toBe(2);
    });

    it("floors the deduction at zero rather than going negative", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: { d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 1 }) },
        }),
      });

      RestEngine.executeShortRest(context, 0, { d8: 3 });

      expect(context.health.hitDice.d8?.currentDice).toBe(0);
    });

    it("leaves hit dice pools untouched when they are not referenced in hitDiceSpent", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: {
            d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 4 }),
            d6: makePool({ dieSize: 6, maxDice: 3, currentDice: 3 }),
          },
        }),
      });

      RestEngine.executeShortRest(context, 0, { d8: 1 });

      expect(context.health.hitDice.d6?.currentDice).toBe(3);
    });

    it("silently ignores a hitDiceSpent entry for a die size the character doesn't have", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: { d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 4 }) },
        }),
      });

      expect(() =>
        RestEngine.executeShortRest(context, 0, { d10: 1 }),
      ).not.toThrow();
      expect(context.health.hitDice.d8?.currentDice).toBe(4);
    });

    it("deducts across multiple different die sizes independently", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: {
            d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 4 }),
            d6: makePool({ dieSize: 6, maxDice: 3, currentDice: 3 }),
          },
        }),
      });

      RestEngine.executeShortRest(context, 0, { d8: 1, d6: 2 });

      expect(context.health.hitDice.d8?.currentDice).toBe(3);
      expect(context.health.hitDice.d6?.currentDice).toBe(1);
    });
  });

  describe("healing", () => {
    it("heals currentHp by the healing amount", () => {
      const context = makeContext({
        health: makeHealth({ currentHp: 5 }),
        maxHp: 20,
      });

      RestEngine.executeShortRest(context, 8);

      expect(context.health.currentHp).toBe(13);
    });

    it("caps healing at maxHp", () => {
      const context = makeContext({
        health: makeHealth({ currentHp: 18 }),
        maxHp: 20,
      });

      RestEngine.executeShortRest(context, 10);

      expect(context.health.currentHp).toBe(20);
    });

    it("does not heal when healingAmount defaults to 0", () => {
      const context = makeContext({ health: makeHealth({ currentHp: 5 }) });

      RestEngine.executeShortRest(context);

      expect(context.health.currentHp).toBe(5);
    });

    it("does not heal (or damage) when healingAmount is negative", () => {
      const context = makeContext({ health: makeHealth({ currentHp: 5 }) });

      RestEngine.executeShortRest(context, -10);

      expect(context.health.currentHp).toBe(5);
    });
  });

  describe("downstream ticking", () => {
    it("resets short_rest resources via resourceManager.tickRest(false)", () => {
      const context = makeContext();
      context.resourceManager.initializeFromGrants([
        { id: "ki", name: "Ki Points", maxCharges: 2, resetOn: "short_rest" },
      ]);
      context.resourceManager.consume("ki", 2);

      RestEngine.executeShortRest(context);

      expect(context.resourceManager.consume("ki", 2)).toBe(true);
    });

    it("does not reset long_rest resources via a short rest", () => {
      const context = makeContext();
      context.resourceManager.initializeFromGrants([
        { id: "rage", name: "Rage", maxCharges: 2, resetOn: "long_rest" },
      ]);
      context.resourceManager.consume("rage", 2);

      RestEngine.executeShortRest(context);

      expect(context.resourceManager.consume("rage", 1)).toBe(false);
    });

    it("clears rest_short effects via effectManager.tickRest(false)", () => {
      const context = makeContext();
      context.effectManager.addEffect({
        instanceId: "short_buff",
        sourceName: "Second Wind",
        durationType: "rest_short",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["second_wind_active"],
      });

      RestEngine.executeShortRest(context);

      expect(context.effectManager.getActiveStates()).toEqual([]);
    });

    it("does not clear rest_long effects via a short rest", () => {
      const context = makeContext();
      context.effectManager.addEffect({
        instanceId: "long_buff",
        sourceName: "Aid",
        durationType: "rest_long",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["aid_active"],
      });

      RestEngine.executeShortRest(context);

      expect(context.effectManager.getActiveStates()).toEqual(["aid_active"]);
    });
  });
});

// #endregion

// #region executeLongRest

describe("RestEngine.executeLongRest", () => {
  describe("HP and temp HP", () => {
    it("fully restores currentHp to maxHp regardless of the prior value", () => {
      const context = makeContext({
        health: makeHealth({ currentHp: 1 }),
        maxHp: 30,
      });

      RestEngine.executeLongRest(context);

      expect(context.health.currentHp).toBe(30);
    });

    it("clears tempHp to 0", () => {
      const context = makeContext({ health: makeHealth({ tempHp: 5 }) });

      RestEngine.executeLongRest(context);

      expect(context.health.tempHp).toBe(0);
    });
  });

  describe("hit dice restoration", () => {
    it("restores half of the total max hit dice, rounded down, to a single pool", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: { d8: makePool({ dieSize: 8, maxDice: 6, currentDice: 2 }) },
        }),
      });

      RestEngine.executeLongRest(context);

      // floor(6 / 2) = 3 regained: 2 + 3 = 5
      expect(context.health.hitDice.d8?.currentDice).toBe(5);
    });

    it("restores a minimum of 1 die even when half the total rounds down below 1", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: { d8: makePool({ dieSize: 8, maxDice: 1, currentDice: 0 }) },
        }),
      });

      RestEngine.executeLongRest(context);

      // floor(1 / 2) = 0, but the engine enforces a minimum of 1
      expect(context.health.hitDice.d8?.currentDice).toBe(1);
    });

    it("prioritizes restoring the largest die size first across multiple pools", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: {
            d6: makePool({ dieSize: 6, maxDice: 4, currentDice: 0 }),
            d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 0 }),
          },
        }),
      });

      RestEngine.executeLongRest(context);

      // totalMax = 8, budget = floor(8/2) = 4, all spent on the larger d8 pool
      expect(context.health.hitDice.d8?.currentDice).toBe(4);
      expect(context.health.hitDice.d6?.currentDice).toBe(0);
    });

    it("carries the regain budget past a larger pool that is already full", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: {
            d10: makePool({ dieSize: 10, maxDice: 2, currentDice: 2 }), // already full
            d8: makePool({ dieSize: 8, maxDice: 4, currentDice: 1 }),
          },
        }),
      });

      RestEngine.executeLongRest(context);

      // totalMax = 6, budget = 3; d10 has nothing missing, so all 3 go to d8
      expect(context.health.hitDice.d10?.currentDice).toBe(2);
      expect(context.health.hitDice.d8?.currentDice).toBe(4);
    });

    it("does not exceed the total regain budget across multiple pools", () => {
      const context = makeContext({
        health: makeHealth({
          hitDice: {
            d10: makePool({ dieSize: 10, maxDice: 5, currentDice: 0 }),
            d8: makePool({ dieSize: 8, maxDice: 5, currentDice: 0 }),
          },
        }),
      });

      RestEngine.executeLongRest(context);

      // totalMax = 10, budget = 5; fully spent on the larger d10 pool
      expect(context.health.hitDice.d10?.currentDice).toBe(5);
      expect(context.health.hitDice.d8?.currentDice).toBe(0);
    });
  });

  describe("downstream ticking", () => {
    it("resets short_rest, long_rest, and dawn resources via resourceManager.tickRest(true)", () => {
      const context = makeContext();
      context.resourceManager.initializeFromGrants([
        { id: "ki", name: "Ki Points", maxCharges: 2, resetOn: "short_rest" },
        { id: "rage", name: "Rage", maxCharges: 2, resetOn: "long_rest" },
        {
          id: "channel_divinity",
          name: "Channel Divinity",
          maxCharges: 1,
          resetOn: "dawn",
        },
      ]);
      context.resourceManager.consume("ki", 2);
      context.resourceManager.consume("rage", 2);
      context.resourceManager.consume("channel_divinity", 1);

      RestEngine.executeLongRest(context);

      expect(context.resourceManager.consume("ki", 2)).toBe(true);
      expect(context.resourceManager.consume("rage", 2)).toBe(true);
      expect(context.resourceManager.consume("channel_divinity", 1)).toBe(
        true,
      );
    });

    it("clears rest_short and rest_long effects via effectManager.tickRest(true), leaving manual and rounds effects alone", () => {
      const context = makeContext();
      context.effectManager.addEffect({
        instanceId: "short_buff",
        sourceName: "Second Wind",
        durationType: "rest_short",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["short_active"],
      });
      context.effectManager.addEffect({
        instanceId: "long_buff",
        sourceName: "Aid",
        durationType: "rest_long",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["long_active"],
      });
      context.effectManager.addEffect({
        instanceId: "manual_buff",
        sourceName: "Ioun Stone",
        durationType: "manual",
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["manual_active"],
      });
      context.effectManager.addEffect({
        instanceId: "rounds_buff",
        sourceName: "Haste",
        durationType: "rounds",
        durationRemaining: 3,
        isSelfConcentration: false,
        modifiers: [],
        grantedStates: ["rounds_active"],
      });

      RestEngine.executeLongRest(context);

      expect(context.effectManager.getActiveStates()).toEqual([
        "manual_active",
        "rounds_active",
      ]);
    });
  });
});

// #endregion
