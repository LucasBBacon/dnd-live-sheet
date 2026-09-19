import { describe, expect, it } from "vitest";
import type { TraitDefinition } from "@project/shared";
import { TableRulesEngine, predicateHolds } from "../tableRules.js";

const helper = (overrides: Partial<TraitDefinition> = {}): TraitDefinition => ({
  id: "trait_test_wolf",
  name: "Totem Spirit: Wolf",
  modifiers: { fixed: [], choices: [] },
  tableNotes: [
    {
      text: "While raging, your friends have advantage.",
      requiredStates: ["status_raging"],
      forbiddenStates: [],
    },
  ],
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
  ...overrides,
});

const resistor = (): TraitDefinition =>
  helper({
    id: "trait_test_resist",
    name: "Stone Skin",
    tableNotes: [],
    affinities: {
      fixed: [{ damageType: "fire", level: "resistance", bypassedBy: [], requiredStates: [] }],
      choices: [],
    },
  });

describe("TableRulesEngine.describe", () => {
  it("shows a note only while its predicate holds", () => {
    expect(TableRulesEngine.describe({ traits: [helper()], activeStates: [] })).toEqual([]);

    expect(
      TableRulesEngine.describe({ traits: [helper()], activeStates: ["status_raging"] }),
    ).toEqual([
      { kind: "note", source: "Totem Spirit: Wolf", text: "While raging, your friends have advantage." },
    ]);
  });

  it("hides a note when a forbidden state is active", () => {
    const gated = helper({
      tableNotes: [
        { text: "Rage ends early.", requiredStates: ["status_raging"], forbiddenStates: ["status_persistent_rage"] },
      ],
    });

    expect(
      TableRulesEngine.describe({
        traits: [gated],
        activeStates: ["status_raging", "status_persistent_rage"],
      }),
    ).toEqual([]);
  });

  it("adds an affinity line for each active affinity group", () => {
    expect(TableRulesEngine.describe({ traits: [resistor()], activeStates: [] })).toEqual([
      { kind: "affinity", source: "Stone Skin", text: "Resistance to fire damage" },
    ]);
  });

  it("lists notes before affinities", () => {
    const lines = TableRulesEngine.describe({
      traits: [resistor(), helper()],
      activeStates: ["status_raging"],
    });

    expect(lines.map((line) => line.kind)).toEqual(["note", "affinity"]);
  });
});

describe("TableRulesEngine.describe: suppressions", () => {
  it("reports each suspended condition by name, with what suspends it", () => {
    expect(
      TableRulesEngine.describe({
        traits: [],
        activeStates: [],
        suspendedConditions: [{ condition: "frightened", source: "Mindless Rage" }],
      }),
    ).toEqual([
      { kind: "suppression", source: "Mindless Rage", text: "Frightened is suspended." },
    ]);
  });

  it("falls back to the id for a condition the map does not name", () => {
    expect(
      TableRulesEngine.describe({
        traits: [],
        activeStates: [],
        suspendedConditions: [{ condition: "not_a_condition", source: "Test" }],
      })[0]?.text,
    ).toBe("not_a_condition is suspended.");
  });

  it("lists suppressions after notes and affinities", () => {
    const lines = TableRulesEngine.describe({
      traits: [resistor(), helper()],
      activeStates: ["status_raging"],
      suspendedConditions: [{ condition: "charmed", source: "Mindless Rage" }],
    });

    expect(lines.map((line) => line.kind)).toEqual(["note", "affinity", "suppression"]);
  });
});

describe("predicateHolds", () => {
  it("treats a missing predicate half as empty", () => {
    expect(predicateHolds({}, ["anything"])).toBe(true);
    expect(predicateHolds({ requiredStates: ["a"] }, [])).toBe(false);
    expect(predicateHolds({ forbiddenStates: ["a"] }, ["a"])).toBe(false);
  });
});
