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
describe("BaseModifierSchema appliesWhen", () => {
  const dangerSense = (appliesWhen?: unknown) => ({
    id: "trait_danger_sense",
    name: "Danger Sense",
    modifiers: {
      fixed: [
        {
          target: "DEX_SAVE",
          type: "advantage",
          ...(appliesWhen !== undefined && { appliesWhen }),
          requiredStates: [],
          forbiddenStates: ["blinded", "deafened", "incapacitated"],
        },
      ],
      choices: [],
    },
  });

  it("accepts a narrative rider the engine cannot evaluate", () => {
    const parsed = TraitDefinitionSchema.parse(
      dangerSense("against effects that you can see, such as traps and spells"),
    );

    expect(parsed.modifiers.fixed[0]?.appliesWhen).toBe(
      "against effects that you can see, such as traps and spells",
    );
  });

  it("leaves the rider absent rather than empty when it is not authored", () => {
    const parsed = TraitDefinitionSchema.parse(dangerSense());

    expect(parsed.modifiers.fixed[0]?.appliesWhen).toBeUndefined();
  });

  it("rejects an empty rider, which would render as a meaningless caveat", () => {
    expect(() => TraitDefinitionSchema.parse(dangerSense(""))).toThrow();
  });

  it("rejects a rider long enough to break the sheet layout", () => {
    expect(() =>
      TraitDefinitionSchema.parse(dangerSense("a".repeat(121))),
    ).toThrow();
  });
});

describe("ModifierTargetSchema ATTACKS_PER_ACTION", () => {
  it("accepts a set_base candidate for the number of attacks the Attack action grants", () => {
    const parsed = TraitDefinitionSchema.parse({
      id: "trait_extra_attack",
      name: "Extra Attack",
      modifiers: {
        fixed: [
          {
            target: "ATTACKS_PER_ACTION",
            type: "set_base",
            value: 2,
            scalingFactor: "class_level_thresholds",
            scalingClassId: "class_barbarian",
            scalingThresholds: [{ minimumLevel: 5, value: 2 }],
            requiredStates: [],
            forbiddenStates: [],
          },
        ],
        choices: [],
      },
    });

    expect(parsed.modifiers.fixed[0]?.target).toBe("ATTACKS_PER_ACTION");
    expect(parsed.modifiers.fixed[0]?.scalingThresholds).toEqual([
      { minimumLevel: 5, value: 2 },
    ]);
  });
});
