import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { AffinityEngine, REAL_DAMAGE_TYPES, listWords } from "../affinities.js";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const rage = (): TraitDefinition => {
  const trait = corePackSnapshot().traitsById["trait_rage"];
  if (!trait) throw new Error("trait_rage missing from the shipped pack");
  return trait;
};

const bearLike = (): TraitDefinition => ({
  id: "trait_test_bear",
  name: "Test Bear",
  modifiers: { fixed: [], choices: [] },
  affinities: {
    fixed: REAL_DAMAGE_TYPES.filter((type) => type !== "psychic").map((type) => ({
      damageType: type,
      level: "resistance" as const,
      bypassedBy: [],
      requiredStates: ["status_raging"],
    })),
    choices: [],
  },
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

describe("AffinityEngine.describe", () => {
  it("reports nothing for Rage while not raging", () => {
    expect(AffinityEngine.describe({ traits: [rage()], activeStates: [] })).toEqual([]);
  });

  it("groups Rage's three resistances into one line while raging", () => {
    const [line, ...rest] = AffinityEngine.describe({
      traits: [rage()],
      activeStates: ["status_raging"],
    });

    expect(rest).toEqual([]);
    expect(line).toMatchObject({ level: "resistance", source: "Rage" });
    expect(line?.damageTypes).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(line?.summary).toBe("Resistance to bludgeoning, piercing and slashing damage");
  });

  it("collapses every type but one into 'all damage except'", () => {
    const [line] = AffinityEngine.describe({
      traits: [bearLike()],
      activeStates: ["status_raging"],
    });

    expect(line?.summary).toBe("Resistance to all damage except psychic");
  });

  it("keeps Rage and Bear as separate lines because they are separate sources", () => {
    const lines = AffinityEngine.describe({
      traits: [rage(), bearLike()],
      activeStates: ["status_raging"],
    });

    expect(lines.map((line) => line.source)).toEqual(["Rage", "Test Bear"]);
  });
});

describe("listWords", () => {
  it("joins with commas and a final 'and'", () => {
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b"])).toBe("a and b");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
