import { describe, expect, it } from "vitest";
import type { RuntimeModifier } from "@project/shared";
import { OVER_CAPACITY_SPEED, SpeedEngine } from "../speed.js";

const mod = (overrides: Partial<RuntimeModifier> = {}): RuntimeModifier => ({
  id: "mod_1",
  sourceName: "Test Source",
  sourceOrigin: "trait:test",
  target: "SPEED",
  type: "add",
  value: 0,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  isActive: true,
  ...overrides,
});

describe("SpeedEngine.calculateSpeed", () => {
  it("returns the racial walking speed when nothing else applies", () => {
    const result = SpeedEngine.calculateSpeed(30, []);

    expect(result.total).toBe(30);
    expect(result.breakdown[0]).toEqual({ name: "Base Speed", value: 30 });
  });

  it("ignores modifiers aimed at another stat", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ target: "ARMOR_CLASS", value: 5 }),
    ]);

    expect(result.total).toBe(30);
  });

  it("skips a modifier switched off", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ value: 10, isActive: false }),
    ]);

    expect(result.total).toBe(30);
  });

  it("adds a flat bonus", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Longstrider", value: 10 }),
    ]);

    expect(result.total).toBe(40);
  });

  it("takes a set_base override that beats the racial speed", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Fleet of Foot", type: "set_base", value: 35 }),
    ]);

    expect(result.total).toBe(35);
  });

  it("ignores a set_base override slower than the racial speed", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ sourceName: "Slow Boots", type: "set_base", value: 25 }),
    ]);

    expect(result.total).toBe(30);
    expect(result.breakdown).toContainEqual({
      name: "Slow Boots",
      value: "Ignored (Does not stack)",
      isIgnored: true,
    });
  });

  it("keeps only the highest of competing overrides", () => {
    const result = SpeedEngine.calculateSpeed(30, [
      mod({ id: "a", sourceName: "Fleet of Foot", type: "set_base", value: 35 }),
      mod({ id: "b", sourceName: "Lesser Boots", type: "set_base", value: 32 }),
    ]);

    expect(result.total).toBe(35);
    expect(result.breakdown).toContainEqual({
      name: "Lesser Boots",
      value: "Ignored (Does not stack)",
      isIgnored: true,
    });
  });

  it("honours a modifier's required state", () => {
    const gated = mod({ value: 10, requiredStates: ["raging"] });

    expect(SpeedEngine.calculateSpeed(30, [gated]).total).toBe(30);
    expect(SpeedEngine.calculateSpeed(30, [gated], ["raging"]).total).toBe(40);
  });

  // the shape of Fast Movement, using the state the pipeline really emits:
  // the id used to be invented here, which documented a gate that existed
  // nowhere and would have gone on passing if the real one were misspelt
  it("honours a modifier's forbidden state", () => {
    const gated = mod({
      value: 10,
      forbiddenStates: ["status_wearing_heavy_armor"],
    });

    expect(
      SpeedEngine.calculateSpeed(30, [gated], ["status_wearing_heavy_armor"])
        .total,
    ).toBe(30);
    // the other direction matters just as much: a filter that dropped every
    // modifier *carrying* a forbidden state, rather than one whose forbidden
    // state is active, would pass the assertion above
    expect(SpeedEngine.calculateSpeed(30, [gated], []).total).toBe(40);
  });

  it("takes 10 feet off when encumbered", () => {
    const result = SpeedEngine.calculateSpeed(30, [], [], "encumbered");

    expect(result.total).toBe(20);
    expect(result.breakdown).toContainEqual({ name: "Encumbered", value: "-10" });
  });

  it("takes 20 feet off when heavily encumbered", () => {
    expect(
      SpeedEngine.calculateSpeed(30, [], [], "heavily_encumbered").total,
    ).toBe(10);
  });

  it("applies a bonus and an encumbrance penalty together", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Longstrider", value: 10 })],
      [],
      "encumbered",
    );

    // note this cannot prove the penalty lands *after* the bonus - addition
    // and subtraction commute. the multiplier test below is what pins the
    // ordering that actually matters
    expect(result.total).toBe(30); // 30 + 10 - 10
  });

  it("multiplies what you can actually manage, not what you could unloaded", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Dash", type: "multiplier", value: 2 })],
      [],
      "encumbered",
    );

    expect(result.total).toBe(40); // (30 - 10) x 2
  });

  it("overrides everything when over capacity", () => {
    const result = SpeedEngine.calculateSpeed(
      30,
      [mod({ sourceName: "Longstrider", value: 10 })],
      [],
      "over_capacity",
    );

    expect(result.total).toBe(OVER_CAPACITY_SPEED);
    expect(result.breakdown).toContainEqual({
      name: "Over Capacity",
      value: `Speed set to ${OVER_CAPACITY_SPEED}`,
    });
  });

  it("never goes below zero", () => {
    const result = SpeedEngine.calculateSpeed(
      25,
      [mod({ sourceName: "Web", value: -20 })],
      [],
      "heavily_encumbered",
    );

    expect(result.total).toBe(0);
  });
});
