import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ModifierSchema } from "../../schemas/character.js";
import { createTestModifier } from "./fixtures/modifiers.js";
import { sumModifiers } from "../reducers.js";

type Modifier = z.infer<typeof ModifierSchema>;

describe("engine reducers", () => {
  describe("basic filtering and summation", () => {
    it("sums only modifiers matching both target and type", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 1, type: "bonus" }),
        createTestModifier({ target: "ac", value: 2, type: "advantage" }),
        createTestModifier({ target: "hp_max", value: 10, type: "bonus" }),
        createTestModifier({ target: "ac", value: 3, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(4);
    });

    it("returns 0 for empty array", () => {
      expect(sumModifiers([], "ac", "bonus")).toBe(0);
    });

    it("returns 0 for unmatched target", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
      ];
      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(0);
    });

    it("returns 0 for unmatched type", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "advantage" }),
      ];
      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(0);
    });
  });

  describe("value handling", () => {
    it("treats missing modifier value as 0", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: undefined, type: "bonus" }),
        createTestModifier({ target: "ac", value: 2, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(2);
    });

    it("allows negative values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: -2, type: "bonus" }),
        createTestModifier({ target: "ac", value: 3, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(1);
    });

    it("handles zero values correctly", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 0, type: "bonus" }),
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(5);
    });

    it("sums multiple negative values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: -5, type: "bonus" }),
        createTestModifier({ target: "ac", value: -3, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(-8);
    });

    it("handles very large positive values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 999999, type: "bonus" }),
        createTestModifier({ target: "ac", value: 1, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(1000000);
    });

    it("handles very large negative values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: -999999, type: "bonus" }),
        createTestModifier({ target: "ac", value: -1, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(-1000000);
    });
  });

  describe("type filtering", () => {
    it("filters by bonus type correctly", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 10, type: "penalty" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(5);
    });

    it("filters by penalty type correctly", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 3, type: "penalty" }),
      ];

      expect(sumModifiers(modifiers, "ac", "penalty")).toBe(3);
    });

    it("returns 0 when requesting penalties with no penalty entries", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 3, type: "bonus" }),
        createTestModifier({ target: "ac", value: 1, type: "advantage" }),
      ];

      expect(sumModifiers(modifiers, "ac", "penalty")).toBe(0);
    });

    it("ignores non-bonus/penalty types", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 100, type: "advantage" }),
        createTestModifier({ target: "ac", value: 100, type: "disadvantage" }),
        createTestModifier({ target: "ac", value: 100, type: "resistance" }),
        createTestModifier({ target: "ac", value: 100, type: "immunity" }),
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(5);
    });
  });

  describe("target filtering", () => {
    it("filters multiple different targets", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 2, type: "bonus" }),
        createTestModifier({ target: "hp_max", value: 10, type: "bonus" }),
        createTestModifier({ target: "initiative", value: 3, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(2);
      expect(sumModifiers(modifiers, "hp_max", "bonus")).toBe(10);
      expect(sumModifiers(modifiers, "initiative", "bonus")).toBe(3);
    });

    it("is case-sensitive for target matching", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "AC", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 3, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(3);
      expect(sumModifiers(modifiers, "AC", "bonus")).toBe(5);
    });
  });

  describe("default parameter", () => {
    it("defaults type parameter to bonus", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac")).toBe(5);
    });

    it("uses default bonus even when penalty exists", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: 2, type: "penalty" }),
      ];

      expect(sumModifiers(modifiers, "ac")).toBe(5);
    });
  });

  describe("complex scenarios", () => {
    it("accumulates many modifiers efficiently", () => {
      const modifiers: Modifier[] = Array.from({ length: 100 }, (_, i) =>
        createTestModifier({ target: "ac", value: i + 1, type: "bonus" })
      );

      // Sum of 1 to 100 = 5050
      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(5050);
    });

    it("handles mixed undefined and defined values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: undefined, type: "bonus" }),
        createTestModifier({ target: "ac", value: 3, type: "bonus" }),
        createTestModifier({ target: "ac", value: undefined, type: "bonus" }),
        createTestModifier({ target: "ac", value: 2, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(10);
    });

    it("handles mixed positive and negative values", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ target: "ac", value: 10, type: "bonus" }),
        createTestModifier({ target: "ac", value: -3, type: "bonus" }),
        createTestModifier({ target: "ac", value: 5, type: "bonus" }),
        createTestModifier({ target: "ac", value: -2, type: "bonus" }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(10);
    });

    it("correctly combines filtering on all dimensions", () => {
      const modifiers: Modifier[] = [
        createTestModifier({
          target: "ac",
          type: "bonus",
          value: 1,
        }),
        createTestModifier({
          target: "ac",
          type: "penalty",
          value: 2,
        }),
        createTestModifier({
          target: "hp_max",
          type: "bonus",
          value: 5,
        }),
        createTestModifier({
          target: "ac",
          type: "advantage",
          value: 100,
        }),
      ];

      expect(sumModifiers(modifiers, "ac", "bonus")).toBe(1);
      expect(sumModifiers(modifiers, "ac", "penalty")).toBe(2);
      expect(sumModifiers(modifiers, "hp_max", "bonus")).toBe(5);
    });
  });

  describe("immutability", () => {
    it("does not mutate the modifiers array", () => {
      const modifiers: Modifier[] = [
        createTestModifier({ value: 2, type: "bonus" }),
        createTestModifier({ value: 3, type: "bonus" }),
      ];
      const original = JSON.stringify(modifiers);

      sumModifiers(modifiers, "ac", "bonus");

      expect(JSON.stringify(modifiers)).toBe(original);
    });

    it("does not mutate individual modifier objects", () => {
      const modifier = createTestModifier({ value: 5, type: "bonus" });
      const original = JSON.stringify(modifier);

      sumModifiers([modifier], "ac", "bonus");

      expect(JSON.stringify(modifier)).toBe(original);
    });
  });
});
