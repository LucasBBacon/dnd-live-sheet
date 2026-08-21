import { describe, expect, it } from "vitest";
import type { CharacterSave } from "@project/shared";
import { corePackSnapshot } from "./corePackFixture.js";
import { CharacterEngine } from "../characterEngine.js";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

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

  it("loads the barbarian, the class authored directly into the pack", () => {
    expect(snapshot.classesById["class_barbarian"]?.hitDie).toBe(12);
  });

  it("loads the eleven classes ported out of the dictionary", () => {
    expect(Object.keys(snapshot.classesById)).toHaveLength(12);
    expect(snapshot.classesById["class_fighter"]?.hitDie).toBe(10);
    expect(snapshot.classesById["class_wizard"]?.hitDie).toBe(6);
  });

  it("loads the traits the barbarian's progression grants", () => {
    expect(snapshot.traitsById["trait_rage"]).toBeDefined();
    expect(snapshot.traitsById["trait_reckless_attack"]).toBeDefined();
  });

  it("loads race traits too, not only class ones", () => {
    expect(Object.keys(snapshot.traitsById).length).toBeGreaterThan(100);
  });

  it("does not invent content the pack has not been given", () => {
    expect(snapshot.classesById["class_artificer"]).toBeUndefined();
  });

  it("marks a ported trait the pack has no rules for as unimplemented", () => {
    // structural completeness without a marker is the bug this pack exists to
    // avoid: a stub must never read as a rule that deliberately grants nothing
    const stub = snapshot.traitsById["trait_action_surge"];

    expect(stub).toBeDefined();
    expect(stub?.implementation?.mode).toBe("unimplemented");
  });
});

/**
 * The assertion this whole migration exists for.
 *
 * Five barbarian features have had real, engine-tested rules for some time and
 * have been dormant because nothing assembled the pack and handed it to the
 * engine. class_barbarian lives only in the pack - it was deliberately left
 * out of CLASS_DICTIONARY - so a barbarian resolved to no progression at all.
 */
describe("a barbarian resolving its pack features", () => {
  const halfElfBarbarian = (level: number): CharacterSave => ({
    attributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
    classes: [{ classId: "class_barbarian", level, selections: {} }],
    traitSelections: {
      half_elf_asi_choice: ["DEX", "CON"],
      skill_versatility_choice: ["stealth", "perception"],
      half_elf_language_choice: ["dwarvish"],
    },
    hp: { current: 12, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
  });

  it("compiles all five features at level 9", () => {
    const traitIds = CharacterBootstrapper.compileActiveTraits(
      halfElfBarbarian(9),
      corePackSnapshot(),
    ).map((trait) => trait.id);

    expect(traitIds).toContain("trait_rage");
    expect(traitIds).toContain("trait_reckless_attack");
    expect(traitIds).toContain("trait_fast_movement");
    expect(traitIds).toContain("trait_feral_instinct");
    expect(traitIds).toContain("trait_brutal_critical");
  });

  it("grants nothing from a level the character has not reached", () => {
    const traitIds = CharacterBootstrapper.compileActiveTraits(
      halfElfBarbarian(4),
      corePackSnapshot(),
    ).map((trait) => trait.id);

    expect(traitIds).toContain("trait_rage");
    expect(traitIds).not.toContain("trait_fast_movement"); // level 5
    expect(traitIds).not.toContain("trait_brutal_critical"); // level 9
  });

  it("builds a whole sheet on pack content", () => {
    const sheet = CharacterEngine.buildLiveSheet(
      halfElfBarbarian(9),
      [],
      new EffectManager(),
      new ResourceManager(),
      { snapshot: corePackSnapshot() },
    );

    // Fast Movement is +10ft while unarmoured, on a 30ft half-elf
    expect(sheet.speed.total).toBe(40);
  });
});
