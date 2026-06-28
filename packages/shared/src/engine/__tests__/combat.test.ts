import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ModifierSchema } from "../../schemas/character.js";
import { createTestModifier } from "./fixtures/modifiers.js";
import { calculateArmorClass, calculateMaxHp } from "../combat.js";

type Modifier = z.infer<typeof ModifierSchema>;

describe("engine combat", () => {
  describe("calculateArmorClass", () => {
    describe("armored AC calculation", () => {
      it("uses armored base AC with uncapped dex modifier", () => {
        expect(calculateArmorClass(14, 16, [], true, null)).toBe(17);
      });

      it("caps dexterity bonus at maxDexBonus when set", () => {
        expect(calculateArmorClass(14, 20, [], true, 2)).toBe(16);
        expect(calculateArmorClass(14, 20, [], true, 0)).toBe(14);
      });

      it("caps dexterity at boundary value (0)", () => {
        expect(calculateArmorClass(14, 20, [], true, 0)).toBe(14);
      });

      it("applies full dex bonus when maxDexBonus is high", () => {
        expect(calculateArmorClass(14, 20, [], true, 10)).toBe(19);
      });

      it("applies dex bonus with base armor values", () => {
        const testCases: [number, number, number, number | null, number][] = [
          // [baseAc, dexScore, expectedDexMod, maxDexBonus, expected]
          [10, 10, 0, null, 10],
          [12, 16, 3, null, 15],
          [16, 8, -1, null, 15],
          [18, 20, 5, 2, 20],
          [13, 14, 2, null, 15],
        ];

        testCases.forEach(([base, dex, dexMod, maxDex, expected]) => {
          expect(calculateArmorClass(base, dex, [], true, maxDex)).toBe(expected);
        });
      });
    });

    describe("unarmored AC calculation", () => {
      it("uses unarmored baseline of 10", () => {
        expect(calculateArmorClass(18, 14, [], false, null)).toBe(12);
      });

      it("ignores base AC when unarmored", () => {
        expect(calculateArmorClass(20, 14, [], false, null)).toBe(12);
        expect(calculateArmorClass(5, 14, [], false, null)).toBe(12);
      });

      it("applies full dex modifier when unarmored", () => {
        expect(calculateArmorClass(100, 8, [], false, null)).toBe(9);
        expect(calculateArmorClass(100, 20, [], false, null)).toBe(15);
      });

      it("applies dex cap regardless of armor status when maxDexBonus is set", () => {
        // Current implementation applies maxDexBonus cap even when unarmored
        // This may be unintended but matches current behavior
        expect(calculateArmorClass(100, 20, [], false, 0)).toBe(10);
        expect(calculateArmorClass(100, 20, [], false, 1)).toBe(11);
      });
    });

    describe("modifier application", () => {
      it("applies only matching AC bonus modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
          createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
          createTestModifier({ target: "ac", value: 10, type: "advantage" }),
        ];

        expect(calculateArmorClass(12, 10, modifiers, true, null)).toBe(14);
      });

      it("ignores non-bonus type modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 100, type: "penalty" }),
          createTestModifier({ target: "ac", value: 100, type: "advantage" }),
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        ];

        expect(calculateArmorClass(12, 10, modifiers, true, null)).toBe(14);
      });

      it("sums multiple AC bonuses", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 1, type: "bonus" }),
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
          createTestModifier({ target: "ac", value: 3, type: "bonus" }),
        ];

        expect(calculateArmorClass(10, 10, modifiers, true, null)).toBe(16);
      });

      it("handles negative bonus modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: -5, type: "bonus" }),
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        ];

        expect(calculateArmorClass(10, 10, modifiers, true, null)).toBe(7);
      });

      it("applies empty modifiers array", () => {
        expect(calculateArmorClass(12, 14, [], true, null)).toBe(14);
      });
    });

    describe("dexterity modifier edge cases", () => {
      it("handles very low dex scores", () => {
        expect(calculateArmorClass(14, 1, [], true, null)).toBe(9);
        expect(calculateArmorClass(14, 3, [], true, null)).toBe(10);
      });

      it("handles very high dex scores", () => {
        expect(calculateArmorClass(14, 30, [], true, null)).toBe(24);
        expect(calculateArmorClass(14, 28, [], true, null)).toBe(23);
      });

      it("caps extreme dex when maxDexBonus is low", () => {
        expect(calculateArmorClass(14, 30, [], true, 0)).toBe(14);
        expect(calculateArmorClass(14, 30, [], true, 1)).toBe(15);
      });

      it("respects dexterity cap correctly", () => {
        // AC 14 + dex bonus capped at 2 = 16
        expect(calculateArmorClass(14, 20, [], true, 2)).toBe(16);
        // AC 14 + dex bonus capped at 2 = 16 (even though dex would give +5)
        expect(calculateArmorClass(14, 20, [], true, 2)).toBe(16);
      });
    });

    describe("edge case combinations", () => {
      it("combines all factors correctly", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 1, type: "bonus" }),
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        ];
        // AC 12 + dex (max 2) + bonuses (3) = 17
        expect(calculateArmorClass(12, 20, modifiers, true, 2)).toBe(17);
      });

      it("handles zero base AC with modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        ];
        expect(calculateArmorClass(0, 10, modifiers, true, null)).toBe(5);
      });
    });
  });

  describe("calculateMaxHp", () => {
    describe("basic HP calculation", () => {
      it("calculates max HP from base, rolls, and constitution contribution", () => {
        expect(calculateMaxHp(10, 14, 3, [6, 5], [])).toBe(21);
      });

      it("supports level 1 with empty hp increases", () => {
        expect(calculateMaxHp(8, 10, 1, [], [])).toBe(8);
      });

      it("uses base HP when it's higher than CON contribution", () => {
        // Base 10 is higher than CON mod 2, so uses 10
        expect(calculateMaxHp(10, 14, 1, [], [])).toBe(10);
      });

      it("uses CON contribution when level is high", () => {
        // With level 5 and high CON mod
        // CON mod 5 (from 20) * 5 levels = 25, base 10 + 0 = 10
        // max(5, 10, 25) = 25
        expect(calculateMaxHp(10, 20, 5, [], [])).toBe(25);
      });

      it("uses level floor for minimum HP", () => {
        // Level 3, base 1, no rolls, CON mod -2
        // conContribution = -2 * 3 = -6
        // max(3, 1+0, -6) = 3
        expect(calculateMaxHp(1, 8, 3, [], [])).toBe(3);
      });
    })

    describe("level and HP increase handling", () => {
      it("sums HP increases across levels", () => {
        // Base 10 + increases [6, 5, 4] = 25 total
        // CON mod 1 * 3 levels = 3
        // max(3, 25, 3) = 25
        expect(calculateMaxHp(10, 12, 3, [6, 5, 4], [])).toBe(25);
      });

      it("handles level 1 (no previous increases)", () => {
        expect(calculateMaxHp(8, 10, 1, [], [])).toBe(8);
      });

      it("handles multiple levels with zero rolls", () => {
        // Base 10 + [0, 0] = 10
        // CON mod -1 * 3 = -3
        // max(3, 10, -3) = 10
        expect(calculateMaxHp(10, 8, 3, [0, 0], [])).toBe(10);
      });

      it("handles negative HP rolls", () => {
        expect(calculateMaxHp(10, 10, 3, [-1, -2], [])).toBe(7);
      });
    })

    describe("HP floor enforcement", () => {
      it("enforces minimum HP floor at character level", () => {
        expect(calculateMaxHp(1, 1, 5, [0, 0, 0, 0], [])).toBe(5);
      });

      it("ensures minimum 1 HP per level with negative CON", () => {
        // With level 3 and very negative CON
        expect(calculateMaxHp(1, 3, 3, [1, 1], [])).toBeGreaterThanOrEqual(3);
      });

      it("respects floor with high CON mod", () => {
        // Base 6 + high CON mod should still work
        const result = calculateMaxHp(6, 20, 3, [5, 4], []);
        expect(result).toBeGreaterThan(0);
      });

      it("documents behavior for unusual input values", () => {
        expect(calculateMaxHp(1, 1, 0, [], [])).toBe(1);
        expect(calculateMaxHp(10, 10, 3, [-1, -2], [])).toBe(7);
      });
    });

    describe("modifier application", () => {
      it("includes external hp_max bonus modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
          createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        ];

        expect(calculateMaxHp(10, 12, 2, [6], modifiers)).toBe(21);
      });

      it("ignores non-hp_max modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "ac", value: 10, type: "bonus" }),
          createTestModifier({ target: "damage", value: 5, type: "bonus" }),
        ];

        expect(calculateMaxHp(10, 12, 2, [6], modifiers)).toBe(16);
      });

      it("sums multiple HP modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "hp_max", value: 3, type: "bonus" }),
          createTestModifier({ target: "hp_max", value: 2, type: "bonus" }),
          createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
        ];

        expect(calculateMaxHp(10, 12, 2, [6], modifiers)).toBe(26);
      });

      it("handles negative HP modifiers", () => {
        const modifiers: Modifier[] = [
          createTestModifier({ target: "hp_max", value: -3, type: "bonus" }),
        ];

        expect(calculateMaxHp(10, 12, 2, [6], modifiers)).toBe(13);
      });

      it("applies empty modifiers array", () => {
        expect(calculateMaxHp(10, 12, 2, [6], [])).toBe(16);
      });
    });

    describe("edge cases", () => {
      it("handles level 0", () => {
        const result = calculateMaxHp(10, 10, 0, [], []);
        expect(result).toBeGreaterThanOrEqual(0);
      });

      it("handles very high levels", () => {
        const result = calculateMaxHp(8, 16, 20, Array(19).fill(6), []);
        expect(result).toBeGreaterThan(0);
      });

      it("handles very low ability scores", () => {
        const result = calculateMaxHp(8, 3, 3, [2, 2], []);
        expect(result).toBeGreaterThanOrEqual(3);
      });

      it("handles very high ability scores", () => {
        // CON 30 gives +10 mod
        // CON contribution: 10 * 3 = 30
        // Base + rolls: 10 + 5 + 5 = 20
        // max(3, 20, 30) = 30
        const result = calculateMaxHp(10, 30, 3, [5, 5], []);
        expect(result).toBe(30);
      });

      it("handles all large negative rolls", () => {
        // Base 5 + [-100, -100] = -195
        // CON mod 0 * 3 = 0
        // max(3, -195, 0) = 3
        expect(calculateMaxHp(5, 10, 3, [-100, -100], [])).toBe(3);
      });

      it("handles mix of positive and negative rolls", () => {
        // Base 10 + [10, -5] = 15
        // CON mod 1 * 3 = 3
        // max(3, 15, 3) = 15
        expect(calculateMaxHp(10, 12, 3, [10, -5], [])).toBe(15);
      });
    })
  });
});
