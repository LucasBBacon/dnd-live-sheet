import { describe, expect, it } from "vitest";
import {
  AbilityKeySchema,
  AbilityMinimumsSchema,
  AbilitySchema,
  abilityScoresOf,
} from "../primitives/ability.js";
import {
  ModifierScalingThresholdSchema,
  ResourceThresholdSchema,
  thresholdOf,
} from "../primitives/scaling.js";
import { CoreRuleIdSchema } from "../primitives/ids.js";
import { StatePredicateSchema } from "../primitives/statePredicate.js";
import { DamageTypeSchema } from "../primitives/damageType.js";
import { choiceOf } from "../primitives/choice.js";
import { z } from "zod";

describe("thresholdOf", () => {
  it("shares one minimumLevel definition", () => {
    const custom = thresholdOf(z.string());
    expect(custom.parse({ minimumLevel: 3, value: "x" })).toEqual({
      minimumLevel: 3,
      value: "x",
    });
  });

  it("rejects level zero, because levels start at one", () => {
    expect(
      ModifierScalingThresholdSchema.safeParse({ minimumLevel: 0, value: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      ModifierScalingThresholdSchema.safeParse({
        minimumLevel: 1,
        value: 1,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("value constraints stay per-use", () => {
  it("lets a modifier threshold carry a fractional value", () => {
    expect(
      ModifierScalingThresholdSchema.parse({ minimumLevel: 5, value: 1.5 })
        .value,
    ).toBe(1.5);
  });

  it("keeps a resource threshold a non-negative integer", () => {
    expect(
      ResourceThresholdSchema.safeParse({ minimumLevel: 5, value: 1.5 })
        .success,
    ).toBe(false);
    expect(
      ResourceThresholdSchema.safeParse({ minimumLevel: 5, value: -1 }).success,
    ).toBe(false);
  });
});

describe("ability primitive", () => {
  it("exposes both casings over one list", () => {
    expect(AbilitySchema.options).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    expect(AbilityKeySchema.options).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  });

  it("builds a bounded score block", () => {
    const rolled = abilityScoresOf(3, 18);
    expect(rolled.safeParse({ str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }).success).toBe(true);
    expect(rolled.safeParse({ str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }).success).toBe(false);
  });

  it("keeps every minimum optional", () => {
    expect(AbilityMinimumsSchema.parse({})).toEqual({});
    expect(AbilityMinimumsSchema.parse({ str: 13 }).str).toBe(13);
  });
});

describe("id primitive", () => {
  it("accepts snake_case ids and rejects other casings", () => {
    expect(CoreRuleIdSchema.safeParse("trait_action_surge").success).toBe(true);
    expect(CoreRuleIdSchema.safeParse("Trait-Action").success).toBe(false);
    expect(CoreRuleIdSchema.safeParse("ab").success).toBe(false);
  });
});

describe("state predicate primitive", () => {
  it("defaults both lists to empty", () => {
    expect(StatePredicateSchema.parse({})).toEqual({
      requiredStates: [],
      forbiddenStates: [],
    });
  });
});

describe("damage type primitive", () => {
  it("still carries same_as_weapon", () => {
    expect(DamageTypeSchema.safeParse("same_as_weapon").success).toBe(true);
  });
});

describe("choiceOf", () => {
  it("builds a choice block with a default pickCount of one", () => {
    const schema = choiceOf(z.string());
    expect(
      schema.parse({ id: "trait_choice_skills", options: ["a", "b"] }),
    ).toEqual({
      id: "trait_choice_skills",
      pickCount: 1,
      options: ["a", "b"],
    });
  });

  it("still enforces the id format on the block it wraps", () => {
    const schema = choiceOf(z.string());
    expect(
      schema.safeParse({ id: "Not Snake Case", options: [] }).success,
    ).toBe(false);
  });

  it("lets a caller override pickCount", () => {
    const schema = choiceOf(z.number());
    expect(
      schema.parse({ id: "trait_choice_stats", pickCount: 2, options: [1, 2, 3] })
        .pickCount,
    ).toBe(2);
  });
});
