import { describe, expect, it } from "vitest";
import {
  collectGrantedResources,
  materialiseMissingPools,
} from "../resourceRules.js";
import { corePackLookup, corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const traitsNamed = (...ids: string[]) =>
  ids.map((id) => {
    const trait = corePackSnapshot().traitsById[id];
    if (!trait) throw new Error(`${id} missing from the shipped pack`);
    return trait;
  });

describe("collectGrantedResources", () => {
  it("collects a resource authored on the trait itself", () => {
    const granted = collectGrantedResources(traitsNamed("trait_rage"), corePackLookup());

    expect(granted.map((resource) => resource.id)).toEqual(["resource_barbarian_rage"]);
  });

  it("collects a pack-level resource that carries the trait's own id", () => {
    // the codebase convention: trait_action_surge the trait spends
    // trait_action_surge the pool, which lives in pack.resources
    const granted = collectGrantedResources(traitsNamed("trait_action_surge"), corePackLookup());

    expect(granted.map((resource) => resource.id)).toEqual(["trait_action_surge"]);
  });

  it("dedupes a resource granted twice", () => {
    const granted = collectGrantedResources(traitsNamed("trait_rage", "trait_rage"), corePackLookup());

    expect(granted).toHaveLength(1);
  });
});

describe("materialiseMissingPools", () => {
  const rage = collectGrantedResources(traitsNamed("trait_rage"), corePackLookup());

  it("creates a full pool for a granted resource the table lacks", () => {
    expect(materialiseMissingPools([], rage, 3, { class_barbarian: 3 })).toEqual([
      { id: "resource_barbarian_rage", name: "Rage", current: 3, max: 3, resetCondition: "long_rest" },
    ]);
  });

  it("leaves an existing pool alone", () => {
    expect(materialiseMissingPools(["resource_barbarian_rage"], rage, 3, { class_barbarian: 3 })).toEqual([]);
  });
});
