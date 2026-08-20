import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "./corePackFixture.js";

/**
 * The fixture reads the real authored pack rather than a hand-written stub.
 *
 * That is the point: these suites are the only place the engine and the
 * rulebook meet, so a fixture that drifted from the shipped content would
 * quietly stop testing anything.
 */
describe("corePackSnapshot", () => {
  const snapshot = corePackSnapshot();

  it("loads every authored race", () => {
    expect(Object.keys(snapshot.racesById)).toHaveLength(9);
  });

  it("carries a race's own speed", () => {
    expect(snapshot.racesById["race_dwarf"]?.speed).toBe(25);
  });

  it("keys subraces by id so the engine can look one up", () => {
    const dwarf = snapshot.racesById["race_dwarf"];

    expect(dwarf?.hasSubraces).toBe(true);
    expect(Object.keys(dwarf?.subraces ?? {}).length).toBeGreaterThan(0);
  });

  it("loads the barbarian, the only class authored so far", () => {
    expect(snapshot.classesById["class_barbarian"]?.hitDie).toBe(12);
  });

  it("loads the traits the barbarian's progression grants", () => {
    expect(snapshot.traitsById["trait_rage"]).toBeDefined();
    expect(snapshot.traitsById["trait_reckless_attack"]).toBeDefined();
  });

  it("loads race traits too, not only class ones", () => {
    expect(Object.keys(snapshot.traitsById).length).toBeGreaterThan(100);
  });

  it("does not invent content the pack has not been given yet", () => {
    // fighter has no pack definition; the dictionary is still its only source
    expect(snapshot.classesById["class_fighter"]).toBeUndefined();
  });
});
