import { describe, expect, it } from "vitest";
import {
  SIZE_CAPACITY_MULTIPLIER,
  oneSizeLarger,
  type CreatureSize,
} from "../creatureSize.js";

describe("SIZE_CAPACITY_MULTIPLIER", () => {
  it("halves capacity for tiny creatures", () => {
    expect(SIZE_CAPACITY_MULTIPLIER.tiny).toBe(0.5);
  });

  it("treats small and medium identically", () => {
    // 5e only penalises Tiny: a halfling carries as much as a human
    expect(SIZE_CAPACITY_MULTIPLIER.small).toBe(1);
    expect(SIZE_CAPACITY_MULTIPLIER.medium).toBe(1);
  });

  it("doubles for each size above medium", () => {
    expect(SIZE_CAPACITY_MULTIPLIER.large).toBe(2);
    expect(SIZE_CAPACITY_MULTIPLIER.huge).toBe(4);
    expect(SIZE_CAPACITY_MULTIPLIER.gargantuan).toBe(8);
  });
});

describe("oneSizeLarger", () => {
  it("steps up one rung of the ladder", () => {
    expect(oneSizeLarger("medium")).toBe("large");
    expect(oneSizeLarger("tiny")).toBe("small");
  });

  it("stays put at the top rather than falling off", () => {
    expect(oneSizeLarger("gargantuan")).toBe("gargantuan");
  });

  it("covers every size in the union", () => {
    const sizes: CreatureSize[] = [
      "tiny",
      "small",
      "medium",
      "large",
      "huge",
      "gargantuan",
    ];

    for (const size of sizes) {
      expect(SIZE_CAPACITY_MULTIPLIER[size]).toBeGreaterThan(0);
      expect(sizes).toContain(oneSizeLarger(size));
    }
  });
});
