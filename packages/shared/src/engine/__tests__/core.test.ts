import { describe, expect, it } from "vitest";
import {
  calculateAbilityModifier,
  calculateProficiencyBonus,
  calculateProficiencyScore,
} from "../core.js";

describe("D&D core math engine", () => {
  it.each([
    [1, -5],
    [2, -4],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [19, 4],
    [20, 5],
    [30, 10],
    [0, -5],
    [-1, -6],
  ])("calculates ability modifier for score %i", (score, expected) => {
    expect(calculateAbilityModifier(score)).toBe(expected);
  });

  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])("scales proficiency bonus for level %i", (level, expected) => {
    expect(calculateProficiencyBonus(level)).toBe(expected);
  });

  it.each([
    [0, 1],
    [-1, 1],
    [21, 7],
  ])("documents current proficiency behavior for level %i", (level, expected) => {
    expect(calculateProficiencyBonus(level)).toBe(expected);
  });

  it.each([
    [10, false, 1, 0, 10],
    [16, true, 5, 0, 16],
    [8, true, 1, 5, 16],
    [1, false, 20, -2, 3],
    [30, true, 20, 0, 26],
    [10, true, 0, 0, 11],
    [14, false, -100, 2, 14],
  ])(
    "calculates proficiency score for ability %i (proficient: %s, level: %i, flat: %i)",
    (abilityScore, isProficient, level, flatBonuses, expected) => {
      expect(
        calculateProficiencyScore(abilityScore, isProficient, level, flatBonuses),
      ).toBe(expected);
    },
  );

  it("is monotonic for valid proficiency levels", () => {
    const values = Array.from({ length: 20 }, (_, i) =>
      calculateProficiencyBonus(i + 1),
    );

    for (let i = 1; i < values.length; i += 1) {
      const current = values[i] as number;
      const previous = values[i - 1] as number;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });
});
