import { describe, expect, it } from "vitest";
import { EncumbranceEngine, type EncumbranceInput } from "../encumbrance.js";
import { poundsToHundredths } from "../weight.js";

/**
 * STR 15 is the fixture strength throughout: capacity 225 lb, with the variant
 * thresholds at 75 lb and 150 lb.
 */
const input = (overrides: Partial<EncumbranceInput> = {}): EncumbranceInput => ({
  totalHundredths: 0,
  strScore: 15,
  size: "medium",
  hasPowerfulBuild: false,
  ...overrides,
});

const carrying = (pounds: number) => ({ totalHundredths: poundsToHundredths(pounds) });

describe("EncumbranceEngine.calculate under the standard rule", () => {
  it("reports capacity as STR x 15", () => {
    expect(EncumbranceEngine.calculate(input()).maxCapacity).toBe(225);
  });

  it("stays unencumbered right up to capacity", () => {
    const result = EncumbranceEngine.calculate(input(carrying(225)));

    expect(result.tier).toBe("none");
    expect(result.states).toEqual([]);
  });

  it("ignores the variant speed tiers entirely", () => {
    // 160 lb is past both variant thresholds and means nothing here
    const result = EncumbranceEngine.calculate(input(carrying(160)));

    expect(result.tier).toBe("none");
    expect(result.encumberedThreshold).toBe(0);
    expect(result.heavilyEncumberedThreshold).toBe(0);
  });

  it("flags going over capacity", () => {
    const result = EncumbranceEngine.calculate(input(carrying(226)));

    expect(result.tier).toBe("over_capacity");
    expect(result.states).toEqual(["over_capacity"]);
  });

  it("reports the carried total back in pounds", () => {
    expect(EncumbranceEngine.calculate(input(carrying(12.5))).totalWeight).toBe(12.5);
  });
});

describe("EncumbranceEngine.calculate under the variant rule", () => {
  const variant = { rules: { useVariantEncumbrance: true } };

  it("publishes both speed thresholds", () => {
    const result = EncumbranceEngine.calculate(input(variant));

    expect(result.encumberedThreshold).toBe(75);
    expect(result.heavilyEncumberedThreshold).toBe(150);
  });

  it("stays clear at exactly the encumbered threshold", () => {
    // the rule is "more than", so 75 lb on the nose is still free movement
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(75) }));

    expect(result.tier).toBe("none");
  });

  it("becomes encumbered one pound past the threshold", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(76) }));

    expect(result.tier).toBe("encumbered");
    expect(result.states).toEqual(["encumbered"]);
  });

  it("stays merely encumbered at exactly the heavily encumbered threshold", () => {
    // the same "more than" rule as the lower threshold: 150 lb on the nose is
    // still only encumbered. without this, a >= regression on the second
    // comparison passes every other test in this file
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(150) }));

    expect(result.tier).toBe("encumbered");
  });

  it("becomes heavily encumbered past STR x 10", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(151) }));

    expect(result.tier).toBe("heavily_encumbered");
    expect(result.states).toEqual(["heavily_encumbered"]);
  });

  it("still tops out at over capacity", () => {
    const result = EncumbranceEngine.calculate(input({ ...variant, ...carrying(300) }));

    expect(result.tier).toBe("over_capacity");
  });
});

describe("EncumbranceEngine.calculate and creature size", () => {
  it("halves capacity for a tiny creature", () => {
    expect(EncumbranceEngine.calculate(input({ size: "tiny" })).maxCapacity).toBe(112.5);
  });

  it("gives a small creature the same capacity as a medium one", () => {
    expect(EncumbranceEngine.calculate(input({ size: "small" })).maxCapacity).toBe(225);
  });

  it("reads the table one size up with Powerful Build", () => {
    const result = EncumbranceEngine.calculate(input({ hasPowerfulBuild: true }));

    expect(result.maxCapacity).toBe(450);
  });

  it("scales the variant thresholds with Powerful Build too", () => {
    const result = EncumbranceEngine.calculate(
      input({
        hasPowerfulBuild: true,
        rules: { useVariantEncumbrance: true },
        ...carrying(140),
      }),
    );

    // 140 lb would be encumbered at medium, but the threshold is now 150
    expect(result.encumberedThreshold).toBe(150);
    expect(result.tier).toBe("none");
  });
});
