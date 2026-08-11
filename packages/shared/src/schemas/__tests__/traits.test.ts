import { describe, expect, it } from "vitest";
import { TraitDefinitionSchema } from "../traits.js";

describe("TraitDefinitionSchema", () => {
  it("accepts manual sheet helper metadata for intentionally non-engine rules", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_fs_protection",
      name: "Fighting Style: Protection",
      description: "Reaction helper.",
      implementation: {
        mode: "manual_sheet_helper",
        summary: "Surface the rule through the live sheet.",
      },
      modifiers: { fixed: [], choices: [] },
      resources: [],
      triggers: [],
      diceRules: [],
      criticalHitModifiers: [],
      actions: [],
    });

    expect(parsed.implementation).toEqual({
      mode: "manual_sheet_helper",
      summary: "Surface the rule through the live sheet.",
      blockedBy: [],
    });
  });
});