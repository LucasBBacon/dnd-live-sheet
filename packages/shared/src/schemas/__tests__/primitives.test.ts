import { describe, expect, it } from "vitest";
import {
  ModifierScalingThresholdSchema,
  ResourceThresholdSchema,
  thresholdOf,
} from "../primitives/scaling.js";
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
