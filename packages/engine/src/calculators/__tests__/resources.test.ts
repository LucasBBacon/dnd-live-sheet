import { beforeEach, describe, expect, it } from "vitest";
import { ResourceManager } from "../resources.js";
import type { Resource } from "@project/shared";
import type { LevelContext } from "../../utils/resourceRules.js";

// ResourceManager exposes no getter for raw charge counts, so these tests
// verify state indirectly through consume()'s boolean return value: e.g.
// consume(id, N) succeeding then consume(id, 1) failing pins currentCharges
// at exactly N.

const makeGrant = (overrides: Partial<Resource> = {}): Resource => ({
  id: "resource_1",
  name: "Test Resource",
  maxRule: { kind: "fixed", value: 1 },
  resetCondition: "short_rest",
  ...overrides,
});

// initializeFromGrants takes a required LevelContext - most of these tests
// exercise "fixed" maxRule grants and have no level to offer at all.
const noLevels: LevelContext = { totalLevel: 0, classLevels: {}, casterLevel: 0 };

let manager: ResourceManager;

beforeEach(() => {
  manager = new ResourceManager();
});

// #region initializeFromGrants

describe("ResourceManager.initializeFromGrants", () => {
  it("creates a resource with currentCharges starting at maxCharges", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 3 } }),
    ], noLevels);

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
          resetCondition: "long_rest",
        },
      ],
      { totalLevel: 6, classLevels: { class_barbarian: 6 }, casterLevel: 0 },
    );

    expect(manager.getRuntimeResources()).toContainEqual(
      expect.objectContaining({ id: "rage", maxCharges: 4, currentCharges: 4 }),
    );
  });

  it("initializes multiple distinct resources independently", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 2 } }),
      makeGrant({
        id: "rage",
        maxRule: { kind: "fixed", value: 3 },
        resetCondition: "long_rest",
      }),
    ], noLevels);

    expect(manager.consume("ki", 2)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
    expect(manager.consume("rage", 3)).toBe(true);
    expect(manager.consume("rage", 1)).toBe(false);
  });

  it("sums maxCharges when the same resource id is granted again (e.g. multiclass spell slot accumulation)", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxRule: { kind: "fixed", value: 2 } }),
    ], noLevels);
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxRule: { kind: "fixed", value: 1 } }),
    ], noLevels);

    // combined max is 2 + 1 = 3
    expect(manager.consume("spell_slots_1", 3)).toBe(true);
    expect(manager.consume("spell_slots_1", 1)).toBe(false);
  });

  it("refills currentCharges to the new combined max on re-grant, even if charges had already been spent (current implementation)", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxRule: { kind: "fixed", value: 2 } }),
    ], noLevels);
    manager.consume("spell_slots_1", 2);
    expect(manager.consume("spell_slots_1", 1)).toBe(false); // confirm depleted

    // NOTE: re-granting the same id doesn't just extend the max, it also
    // resets currentCharges to the new full max - prior consumption is lost.
    manager.initializeFromGrants([
      makeGrant({ id: "spell_slots_1", maxRule: { kind: "fixed", value: 1 } }),
    ], noLevels);

    expect(manager.consume("spell_slots_1", 3)).toBe(true); // 2 + 1, fully refilled
  });
});

// #endregion

// #region consume

describe("ResourceManager.consume", () => {
  it("consumes a single charge by default when no amount is given", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 2 } }),
    ], noLevels);

    expect(manager.consume("ki")).toBe(true);
    expect(manager.consume("ki")).toBe(true);
    expect(manager.consume("ki")).toBe(false);
  });

  it("consumes a specified amount at once", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 5 } }),
    ], noLevels);

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 2)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("allows consuming exactly the remaining charges down to zero", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 3 } }),
    ], noLevels);

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("fails and leaves charges unchanged when the requested amount exceeds what is available", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 2 } }),
    ], noLevels);

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
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 4 } }),
    ], noLevels);
    manager.consume("ki", 3); // 1 remaining

    manager.restore("ki", 2); // 1 + 2 = 3

    expect(manager.consume("ki", 3)).toBe(true);
    expect(manager.consume("ki", 1)).toBe(false);
  });

  it("caps restored charges at maxCharges rather than overflowing", () => {
    manager.initializeFromGrants([
      makeGrant({ id: "ki", maxRule: { kind: "fixed", value: 4 } }),
    ], noLevels);
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
      makeGrant({
        id: "ki",
        maxRule: { kind: "fixed", value: 2 },
        resetCondition: "short_rest",
      }),
    ], noLevels);
    manager.consume("ki", 2);
    expect(manager.consume("ki", 1)).toBe(false);

    manager.tickRest(false);

    expect(manager.consume("ki", 2)).toBe(true);
  });

  it("does not reset long_rest resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "rage",
        maxRule: { kind: "fixed", value: 2 },
        resetCondition: "long_rest",
      }),
    ], noLevels);
    manager.consume("rage", 2);

    manager.tickRest(false);

    expect(manager.consume("rage", 1)).toBe(false);
  });

  it("does not reset dawn resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "channel_divinity",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "dawn",
      }),
    ], noLevels);
    manager.consume("channel_divinity", 1);

    manager.tickRest(false);

    expect(manager.consume("channel_divinity", 1)).toBe(false);
  });

  it("does not reset start_of_turn or initiative_roll resources on a rest (long or short)", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "bardic_die",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "start_of_turn",
      }),
      makeGrant({
        id: "lucky_points",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "initiative_roll",
      }),
    ], noLevels);
    manager.consume("bardic_die", 1);
    manager.consume("lucky_points", 1);

    manager.tickRest(true);

    expect(manager.consume("bardic_die", 1)).toBe(false);
    expect(manager.consume("lucky_points", 1)).toBe(false);
  });

  it("does not reset long_rest_half resources on a short rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "font_of_inspiration",
        maxRule: { kind: "fixed", value: 4 },
        resetCondition: "long_rest_half",
      }),
    ], noLevels);
    manager.consume("font_of_inspiration", 4);

    manager.tickRest(false);

    expect(manager.consume("font_of_inspiration", 1)).toBe(false);
  });

  it("restores half of max charges, rounded down, on top of what remains, on a long rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "font_of_inspiration",
        maxRule: { kind: "fixed", value: 5 },
        resetCondition: "long_rest_half",
      }),
    ], noLevels);
    manager.consume("font_of_inspiration", 3); // 2 remaining

    manager.tickRest(true);

    // floor(5 / 2) = 2, added to the 2 that remained: 4 total
    expect(manager.consume("font_of_inspiration", 4)).toBe(true);
    expect(manager.consume("font_of_inspiration", 1)).toBe(false);
  });

  it("never regains less than 1 long_rest_half charge, even when half rounds down to zero", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "font_of_inspiration",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "long_rest_half",
      }),
    ], noLevels);
    manager.consume("font_of_inspiration", 1);

    manager.tickRest(true);

    expect(manager.consume("font_of_inspiration", 1)).toBe(true);
  });

  it("does not let a long_rest_half recovery push currentCharges above maxCharges", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "font_of_inspiration",
        maxRule: { kind: "fixed", value: 4 },
        resetCondition: "long_rest_half",
      }),
    ], noLevels);
    manager.consume("font_of_inspiration", 1); // 3 remaining, half-recovery would be 3 + 2 = 5

    manager.tickRest(true);

    // capped at maxCharges (4), not 5
    expect(manager.consume("font_of_inspiration", 4)).toBe(true);
    expect(manager.consume("font_of_inspiration", 1)).toBe(false);
  });

  it("resets short_rest, long_rest, and dawn resources together on a long rest", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "ki",
        maxRule: { kind: "fixed", value: 2 },
        resetCondition: "short_rest",
      }),
      makeGrant({
        id: "rage",
        maxRule: { kind: "fixed", value: 2 },
        resetCondition: "long_rest",
      }),
      makeGrant({
        id: "channel_divinity",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "dawn",
      }),
    ], noLevels);
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
      makeGrant({
        id: "bardic_die",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "start_of_turn",
      }),
    ], noLevels);
    manager.consume("bardic_die", 1);
    expect(manager.consume("bardic_die", 1)).toBe(false);

    manager.tickStartOfTurn();

    expect(manager.consume("bardic_die", 1)).toBe(true);
  });

  it("does not reset short_rest, long_rest, dawn, or initiative_roll resources", () => {
    manager.initializeFromGrants([
      makeGrant({
        id: "ki",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "short_rest",
      }),
      makeGrant({
        id: "rage",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "long_rest",
      }),
      makeGrant({
        id: "channel_divinity",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "dawn",
      }),
      makeGrant({
        id: "lucky_points",
        maxRule: { kind: "fixed", value: 1 },
        resetCondition: "initiative_roll",
      }),
    ], noLevels);
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

describe("hydrateFromPersisted", () => {
  const persisted = (overrides = {}) => ({
    id: "resource_barbarian_rage",
    name: "Rage",
    maxCharges: 3,
    currentCharges: 1,
    resetOn: "long_rest" as const,
    ...overrides,
  });

  it("seeds a pool at its persisted charges, not at full", () => {
    manager.hydrateFromPersisted([persisted()]);

    // 1 charge persisted: one consume succeeds, a second must not
    expect(manager.consume("resource_barbarian_rage", 1)).toBe(true);
    expect(manager.consume("resource_barbarian_rage", 1)).toBe(false);
  });

  it("replaces earlier state rather than accumulating onto it", () => {
    // initializeFromGrants sums max charges for overlapping pools, so a
    // repeated hydrate would otherwise grow the pool without bound - the
    // defect that made the server refill every resource on every request.
    manager.initializeFromGrants([makeGrant({ id: "resource_barbarian_rage", maxRule: { kind: "fixed", value: 3 } })], noLevels);
    manager.hydrateFromPersisted([persisted()]);
    manager.hydrateFromPersisted([persisted()]);

    const pools = manager.getRuntimeResources();
    expect(pools).toHaveLength(1);
    expect(pools[0]!.maxCharges).toBe(3);
    expect(pools[0]!.currentCharges).toBe(1);
  });

  it("drops pools the persisted state no longer carries", () => {
    manager.initializeFromGrants([makeGrant({ id: "resource_gone" })], noLevels);
    manager.hydrateFromPersisted([persisted()]);

    expect(manager.getRuntimeResources().map((r) => r.id)).toEqual([
      "resource_barbarian_rage",
    ]);
  });
});
