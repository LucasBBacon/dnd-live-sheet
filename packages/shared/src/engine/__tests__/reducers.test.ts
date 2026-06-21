import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ModifierSchema } from "../../schemas/character.js";
import { createTestModifier } from "./fixtures/modifiers.js";
import { sumModifiers } from "../reducers.js";

type Modifier = z.infer<typeof ModifierSchema>;

describe("engine reducers", () => {
  it("sums only modifiers matching both target and type", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "ac", value: 1, type: "bonus" }),
      createTestModifier({ target: "ac", value: 2, type: "advantage" }),
      createTestModifier({ target: "hp_max", value: 10, type: "bonus" }),
      createTestModifier({ target: "ac", value: 3, type: "bonus" }),
    ];

    expect(sumModifiers(modifiers, "ac", "bonus")).toBe(4);
  });

  it("returns 0 for empty arrays and unmatched targets", () => {
    expect(sumModifiers([], "ac", "bonus")).toBe(0);

    const modifiers: Modifier[] = [
      createTestModifier({ target: "hp_max", value: 5, type: "bonus" }),
    ];
    expect(sumModifiers(modifiers, "ac", "bonus")).toBe(0);
  });

  it("treats missing modifier value as 0", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "ac", value: undefined, type: "bonus" }),
      createTestModifier({ target: "ac", value: 2, type: "bonus" }),
    ];

    expect(sumModifiers(modifiers, "ac", "bonus")).toBe(2);
  });

  it("allows negative bonus values", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "ac", value: -2, type: "bonus" }),
      createTestModifier({ target: "ac", value: 3, type: "bonus" }),
    ];

    expect(sumModifiers(modifiers, "ac", "bonus")).toBe(1);
  });

  it("returns 0 when requesting penalties with no penalty entries", () => {
    const modifiers: Modifier[] = [
      createTestModifier({ target: "ac", value: 3, type: "bonus" }),
      createTestModifier({ target: "ac", value: 1, type: "advantage" }),
    ];

    expect(sumModifiers(modifiers, "ac", "penalty")).toBe(0);
  });
});
