import { describe, expect, it } from "vitest";
import { TraitDefinitionSchema } from "../traits.js";

describe("TraitDefinitionSchema", () => {
  it("accepts manual sheet helper metadata for intentionally non-engine rules", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_fs_protection",
      name: "Fighting Style: Protection",
      lore: { shortDescription: "Reaction helper." },
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

  it("accepts an ability-sum AC formula on a trait modifier", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_unarmored_defense_barbarian",
      name: "Unarmored Defense (Barbarian)",
      modifiers: {
        fixed: [
          {
            target: "ARMOR_CLASS",
            type: "set_base",
            value: 10,
            formula: {
              kind: "ability_sum",
              base: 10,
              abilities: ["DEX", "CON"],
            },
            requiredStates: [],
            forbiddenStates: ["status_wearing_armor"],
          },
        ],
        choices: [],
      },
    });

    expect(parsed.modifiers.fixed[0]?.formula).toEqual({
      kind: "ability_sum",
      base: 10,
      abilities: ["DEX", "CON"],
    });
  });
});