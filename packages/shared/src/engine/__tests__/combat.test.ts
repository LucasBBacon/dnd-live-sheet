import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ModifierSchema } from "../../schemas/character.js";
import { createTestModifier } from "./fixtures/modifiers.js";
import { calculateArmorClass, calculateMaxHp } from "../combat.js";

type Modifier = z.infer<typeof ModifierSchema>;

describe("engine combat", () => {
  describe("calculateArmorClass", () => {
    it("uses armored base AC with uncapped dex modifier", () => {
      expect(calculateArmorClass(14, 16, [], true, null)).toBe(17);
    });

    it("caps dexterity bonus when maxDexBonus is set", () => {
      expect(calculateArmorClass(14, 20, [], true, 2)).toBe(16);
      expect(calculateArmorClass(14, 20, [], true, 0)).toBe(14);
    });

    it("uses unarmored baseline of 10", () => {
      expect(calculateArmorClass(18, 14, [], false, null)).toBe(12);
    });

    it("applies only matching AC bonus modifiers", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 10, type: "advantage" }),
      ];

      expect(calculateArmorClass(12, 10, modifiers, true, null)).toBe(14);
    });

    it("supports negative dexterity modifiers", () => {
      expect(calculateArmorClass(12, 8, [], false, null)).toBe(9);
    });
  });

  describe("calculateMaxHp", () => {
    it("calculates max HP from base, rolls, and constitution contribution", () => {
      expect(calculateMaxHp(10, 14, 3, [6, 5], [])).toBe(21);
    });

    it("enforces minimum HP floor at character level", () => {
      expect(calculateMaxHp(1, 1, 5, [0, 0, 0, 0], [])).toBe(5);
    });

    it("supports level 1 with empty hp increases", () => {
      expect(calculateMaxHp(8, 10, 1, [], [])).toBe(8);
    });

    it("includes external hp_max bonus modifiers", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 2, type: "bonus" }),
      ];

      expect(calculateMaxHp(10, 12, 2, [6], modifiers)).toBe(21);
    });

    it("documents current behavior for unusual input values", () => {
      expect(calculateMaxHp(1, 1, 0, [], [])).toBe(1);
      expect(calculateMaxHp(10, 10, 3, [-1, -2], [])).toBe(7);
    });
  });
});
