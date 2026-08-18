import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { StateExtractor } from "../stateExtractor.js";
import { TRAIT_DICTIONARY } from "../../rules/traitDictionary.js";

const trait = (
  id: string,
  grantedStates?: string[],
): TraitDefinition => ({
  id,
  name: id,
  modifiers: { fixed: [], choices: [] },
  ...(grantedStates && { grantedStates }),
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
});

describe("StateExtractor.extractStates", () => {
  it("returns nothing for a character with no traits", () => {
    expect(StateExtractor.extractStates([])).toEqual([]);
  });

  it("ignores traits that grant no states", () => {
    expect(StateExtractor.extractStates([trait("plain")])).toEqual([]);
  });

  it("collects the states a trait grants", () => {
    const states = StateExtractor.extractStates([
      trait("bulky", ["powerful_build"]),
    ]);

    expect(states).toEqual(["powerful_build"]);
  });

  it("de-duplicates a state two traits both grant", () => {
    const states = StateExtractor.extractStates([
      trait("a", ["amphibious"]),
      trait("b", ["amphibious", "sunlight_sensitive"]),
    ]);

    expect(states).toHaveLength(2);
    expect(states).toContain("amphibious");
    expect(states).toContain("sunlight_sensitive");
  });

  it("reads the authored Powerful Build trait", () => {
    const powerfulBuild = TRAIT_DICTIONARY.trait_powerful_build;

    expect(powerfulBuild).toBeDefined();
    expect(StateExtractor.extractStates([powerfulBuild!])).toEqual([
      "powerful_build",
    ]);
  });
});
