import { describe, expect, it } from "vitest";
import type { ResourceRule } from "@project/shared";
import { RestEngine } from "../rests.js";
import type { OperationalResource } from "../../types/resources.js";

const rule = (
  id: string,
  resetCondition: ResourceRule["resetCondition"],
  value: number,
): ResourceRule => ({
  id,
  name: id,
  resetCondition,
  maxRule: { kind: "fixed", value },
});

const snapshot = {
  resourcesById: {
    short: rule("short", "short_rest", 2),
    long: rule("long", "long_rest", 3),
    dawn: rule("dawn", "dawn", 1),
    half: rule("half", "long_rest_half", 6),
    never: rule("never", "never", 4),
  },
};

const spent = (id: string, current = 0): OperationalResource => ({ id, current });

const rest = (resources: OperationalResource[], type: "short" | "long") =>
  RestEngine.applyRest(resources, type, 5, {}, snapshot);

const chargesOf = (resources: OperationalResource[], id: string) =>
  resources.find((resource) => resource.id === id)?.current;

describe("RestEngine.applyRest", () => {
  it("refills short-rest resources on a short rest", () => {
    const result = rest([spent("short")], "short");
    expect(chargesOf(result, "short")).toBe(2);
  });

  it("leaves long-rest and dawn resources alone on a short rest", () => {
    const result = rest([spent("long"), spent("dawn")], "short");

    expect(chargesOf(result, "long")).toBe(0);
    expect(chargesOf(result, "dawn")).toBe(0);
  });

  it("refills short, long and dawn resources on a long rest", () => {
    const result = rest([spent("short"), spent("long"), spent("dawn")], "long");

    expect(chargesOf(result, "short")).toBe(2);
    expect(chargesOf(result, "long")).toBe(3);
    expect(chargesOf(result, "dawn")).toBe(1);
  });

  it("never refills a resource that never resets", () => {
    expect(chargesOf(rest([spent("never")], "long"), "never")).toBe(0);
  });

  it("restores half the maximum for long_rest_half", () => {
    // max 6, so a fully spent pool comes back to 3
    expect(chargesOf(rest([spent("half")], "long"), "half")).toBe(3);
  });

  it("caps long_rest_half recovery at the maximum", () => {
    expect(chargesOf(rest([spent("half", 5)], "long"), "half")).toBe(6);
  });

  it("always returns at least one charge for long_rest_half", () => {
    const tiny = {
      resourcesById: { half: rule("half", "long_rest_half", 1) },
    };

    const result = RestEngine.applyRest([spent("half")], "long", 5, {}, tiny);
    expect(chargesOf(result, "half")).toBe(1);
  });

  it("leaves a resource with no rule exactly as it was", () => {
    const result = rest([spent("homebrew", 2)], "long");
    expect(chargesOf(result, "homebrew")).toBe(2);
  });

  it("does not mutate the resources it was given", () => {
    const resources = [spent("short")];

    rest(resources, "long");

    expect(resources[0]?.current).toBe(0);
  });
});
