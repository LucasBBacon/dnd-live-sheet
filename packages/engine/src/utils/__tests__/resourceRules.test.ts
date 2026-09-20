import { describe, expect, it } from "vitest";
import {
  buildLevelContext,
  collectGrantedResources,
  getResourceMaxUses,
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

  const levels = { totalLevel: 3, classLevels: { class_barbarian: 3 }, casterLevel: 0 };

  it("creates a full pool for a granted resource the table lacks", () => {
    expect(materialiseMissingPools([], rage, levels)).toEqual([
      { id: "resource_barbarian_rage", name: "Rage", current: 3, max: 3, resetCondition: "long_rest" },
    ]);
  });

  it("leaves an existing pool alone", () => {
    expect(materialiseMissingPools(["resource_barbarian_rage"], rage, levels)).toEqual([]);
  });
});

describe("caster_level_thresholds", () => {
  const slots = {
    id: "spell_slots_3",
    name: "3rd-Level Slots",
    resetCondition: "long_rest" as const,
    maxRule: {
      kind: "caster_level_thresholds" as const,
      thresholds: [
        { minimumLevel: 5, value: 2 },
        { minimumLevel: 6, value: 3 },
      ],
    },
  };

  it("reads caster level, not total level", () => {
    // a paladin 9 is caster level 5: two third-level slots, though their
    // character level is 9 and their class level is 9
    expect(
      getResourceMaxUses(slots, {
        totalLevel: 9,
        classLevels: { class_paladin: 9 },
        casterLevel: 5,
      }),
    ).toBe(2);
  });

  it("is zero below the first rung", () => {
    expect(
      getResourceMaxUses(slots, {
        totalLevel: 4,
        classLevels: { class_wizard: 4 },
        casterLevel: 4,
      }),
    ).toBe(0);
  });
});

describe("buildLevelContext", () => {
  const snapshot = {
    classesById: {
      class_wizard: {
        id: "class_wizard",
        spellcasting: { ability: "INT", progression: "full" },
      },
      class_barbarian: { id: "class_barbarian" },
    },
    subclassesById: {},
  } as never;

  it("totals the levels and derives caster level", () => {
    expect(
      buildLevelContext({ class_wizard: 3, class_barbarian: 2 }, {}, snapshot),
    ).toEqual({
      totalLevel: 5,
      classLevels: { class_wizard: 3, class_barbarian: 2 },
      casterLevel: 3,
    });
  });

  it("reports caster level zero for a character that casts nothing", () => {
    expect(buildLevelContext({ class_barbarian: 5 }, {}, snapshot).casterLevel).toBe(0);
  });
});
