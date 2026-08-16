import { beforeEach, describe, expect, it } from "vitest";
import { ResourceManager } from "../resources.js";
import type { ResourceGrant } from "@project/shared";

// ResourceManager exposes no getter for raw charge counts, so these tests
// verify state indirectly through consume()'s boolean return value: e.g.
// consume(id, N) succeeding then consume(id, 1) failing pins currentCharges
// at exactly N.

const makeGrant = (overrides: Partial<ResourceGrant> = {}): ResourceGrant => ({
  id: "resource_1",
  name: "Test Resource",
  maxCharges: 1,
  resetOn: "short_rest",
  ...overrides,
});

let manager: ResourceManager;

beforeEach(() => {
  manager = new ResourceManager();
});

// #region initializeFromGrants

describe("ResourceManager.initializeFromGrants", () => {
  it("creates a resource with currentCharges starting at maxCharges", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 3 })]);

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("resolves class-level threshold capacities", () => {
    manager.initializeFromGrants(
      [
        {
          id: "rage",
          name: "Rage",
          maxRule: {
            kind: "class_level_thresholds",
            classId: "class_barbarian",
            thresholds: [
              { minimumLevel: 1, value: 2 },
              { minimumLevel: 3, value: 3 },
              { minimumLevel: 6, value: 4 },
            ],
          },
          resetOn: "long_rest",
        },
      ],
      { classes: { class_barbarian: 6 } },
    );

    expect(manager.getRuntimeResources()).toContainEqual(
      expect.objectContaining({ id: "rage", maxCharges: 4, currentCharges: 4 }),
    );
  });

  it("initializes multiple distinct resources independently", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxCharges: 2 }),
      makeGrant({ id: "rage", maxCharges: 3, resetOn: "long_rest" }),
    ]);

    expect(manager.consume("ki", 2)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
    expect(manager.consume("rage", 3)).toBe(true);
    expect(manager.consume("rage", 1)).toBe(false);
  });

  it("sums maxCharges when the same resource id is granted again (e.g. multiclass spell slot accumulation)", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxCharges: 2 }),
    ]);
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxCharges: 1 }),
    ]);

    // combined max is 2 + 1 = 3
    expect(manager.consume("spell_slots_1", 3)).toBe(true);
    expect(manager.consume("spell_slots_1", 1)).toBe(false);
  });

  it("refills currentCharges to the new combined max on re-grant, even if charges had already been spent (current implementation)", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxCharges: 2 }),
    ]);
    manager.consume("spell_slots_1", 2);
    expect(manager.consume("spell_slots_1", 1)).toBe(false); // confirm depleted

    // NOTE: re-granting the same id doesn't just extend the max, it also
    // resets currentCharges to the new full max - prior consumption is lost.
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxCharges: 1 }),
    ]);

    expect(manager.consume("spell_slots_1", 3)).toBe(true); // 2 + 1, fully refilled
  });
});

// #endregion

// #region consume

describe("ResourceManager.consume", () => {
  it("consumes a single charge by default when no amount is given", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 2 })]);

    expect(manager.consume("ki")).toBe(true);
    expect(manager.consume("ki")).toBe(true);
    expect(manager.consume("ki")).toBe(false);
  });

  it("consumes a specified amount at once", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 5 })]);

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 2)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("allows consuming exactly the remaining charges down to zero", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 3 })]);

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("fails and leaves charges unchanged when the requested amount exceeds what is available", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 2 })]);

    expect(manager.consume("ki", 3)).toBe(false);
    // the failed attempt above must not have partially deducted anything
    expect(manager.consume("ki", 2)).toBe(true);
  });

  it("returns false for an unknown resource id without throwing", () => {
    expect(() => manager.consume("does_not_exist")).not.toThrow();
    expect(manager.consume("does_not_exist")).toBe(false);
  });
});

// #endregion

// #region restore

describe("ResourceManager.restore", () => {
  it("restores a partial amount of spent charges", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 4 })]);
    manager.consume("ki", 3); // 1 remaining

    manager.restore("ki", 2); // 1 + 2 = 3

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("caps restored charges at maxCharges rather than overflowing", () => {
    manager.initializeFromGrants([makeGrant({ id: "ki", maxCharges: 4 })]);
    manager.consume("ki", 1); // 3 remaining

    manager.restore("ki", 10); // should cap at 4, not 13

    expect(manager.consume("ki", 4)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("is a no-op for an unknown resource id", () => {
    expect(() => manager.restore("does_not_exist", 5)).not.toThrow();
  });
});

// #endregion

// #region tickRest

describe("ResourceManager.tickRest", () => {
  it("resets short_rest resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxCharges: 2, resetOn: "short_rest" }),
    ]);
    manager.consume("ki", 2);
    expect(manager.consume("ki", 1)).toBe(false);

    manager.tickRest(false);

    expect(manager.consume("ki", 2)).toBe(true);
  });

  it("does not reset long_rest resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "rage", maxCharges: 2, resetOn: "long_rest" }),
    ]);
    manager.consume("rage", 2);

    manager.tickRest(false);

    expect(manager.consume("rage", 1)).toBe(false);
  });

  it("does not reset dawn resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "channel_divinity",
        maxCharges: 1,
        resetOn: "dawn",
      }),
    ]);
    manager.consume("channel_divinity", 1);

    manager.tickRest(false);

    expect(manager.consume("channel_divinity", 1)).toBe(false);
  });

  it("does not reset start_of_turn or initiative_roll resources on a rest (long or short)", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "bardic_die", maxCharges: 1, resetOn: "start_of_turn" }),
      makeGrant({
        id: "lucky_points",
        maxCharges: 1,
        resetOn: "initiative_roll",
      }),
    ]);
    manager.consume("bardic_die", 1);
    manager.consume("lucky_points", 1);

    manager.tickRest(true);

    expect(manager.consume("bardic_die", 1)).toBe(false);
    expect(manager.consume("lucky_points", 1)).toBe(false);
  });

  it("resets short_rest, long_rest, and dawn resources together on a long rest", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxCharges: 2, resetOn: "short_rest" }),
      makeGrant({ id: "rage", maxCharges: 2, resetOn: "long_rest" }),
      makeGrant({ id: "channel_divinity", maxCharges: 1, resetOn: "dawn" }),
    ]);
    manager.consume("ki", 2);
    manager.consume("rage", 2);
    manager.consume("channel_divinity", 1);

    manager.tickRest(true);

    expect(manager.consume("ki", 2)).toBe(true);
    expect(manager.consume("rage", 2)).toBe(true);
    expect(manager.consume("channel_divinity", 1)).toBe(true);
  });
});

// #endregion

// #region tickStartOfTurn

describe("ResourceManager.tickStartOfTurn", () => {
  it("resets start_of_turn resources", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "bardic_die", maxCharges: 1, resetOn: "start_of_turn" }),
    ]);
    manager.consume("bardic_die", 1);
    expect(manager.consume("bardic_die", 1)).toBe(false);

    manager.tickStartOfTurn();

    expect(manager.consume("bardic_die", 1)).toBe(true);
  });

  it("does not reset short_rest, long_rest, dawn, or initiative_roll resources", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxCharges: 1, resetOn: "short_rest" }),
      makeGrant({ id: "rage", maxCharges: 1, resetOn: "long_rest" }),
      makeGrant({ id: "channel_divinity", maxCharges: 1, resetOn: "dawn" }),
      makeGrant({
        id: "lucky_points",
        maxCharges: 1,
        resetOn: "initiative_roll",
      }),
    ]);
    manager.consume("ki", 1);
    manager.consume("rage", 1);
    manager.consume("channel_divinity", 1);
    manager.consume("lucky_points", 1);

    manager.tickStartOfTurn();

    expect(manager.consume("ki", 1)).toBe(false);
    expect(manager.consume("rage", 1)).toBe(false);
    expect(manager.consume("channel_divinity", 1)).toBe(false);
    expect(manager.consume("lucky_points", 1)).toBe(false);
  });
});

// #endregion
