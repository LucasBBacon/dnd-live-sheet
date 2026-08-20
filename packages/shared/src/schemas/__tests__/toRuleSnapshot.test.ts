import { describe, expect, it } from "vitest";
import { toRuleSnapshot } from "../coreRulePack.js";
import type { CoreRulePack } from "../coreRulePack.js";

const pack = (overrides: Partial<CoreRulePack> = {}): CoreRulePack =>
  ({
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
    traits: [],
    races: [],
    classes: [],
    subclasses: [],
    feats: [],
    backgrounds: [],
    spells: [],
    equipment: [],
    proficiencies: [],
    ...overrides,
  }) as CoreRulePack;

const dwarf = {
  id: "race_dwarf",
  name: "Dwarf",
  size: "medium",
  speed: 25,
  lore: { shortDescription: "Stout folk." },
  grantedTraitIds: ["trait_darkvision"],
  hasSubraces: true,
  // keyed by id, the way packs actually author them
  subraces: {
    subrace_hill_dwarf: {
      id: "subrace_hill_dwarf",
      name: "Hill Dwarf",
      grantedTraitIds: ["trait_dwarven_toughness"],
    },
  },
};

describe("toRuleSnapshot", () => {
  it("keys traits by their id", () => {
    const snapshot = toRuleSnapshot(
      pack({
        traits: [
          {
            id: "trait_rage",
            name: "Rage",
            lore: { shortDescription: "Fury." },
            modifiers: { fixed: [], choices: [] },
            resources: [],
            triggers: [],
            diceRules: [],
            criticalHitModifiers: [],
            actions: [],
          },
        ],
      } as never),
    );

    expect(snapshot.traitsById["trait_rage"]?.name).toBe("Rage");
  });

  it("keys races by their id", () => {
    const snapshot = toRuleSnapshot(pack({ races: [dwarf] } as never));

    expect(snapshot.racesById["race_dwarf"]?.speed).toBe(25);
  });

  it("carries subraces through keyed by id, as both pack and engine expect", () => {
    const snapshot = toRuleSnapshot(pack({ races: [dwarf] } as never));

    expect(
      snapshot.racesById["race_dwarf"]?.subraces["subrace_hill_dwarf"]?.name,
    ).toBe("Hill Dwarf");
  });

  it("leaves a race with no subraces holding an empty record", () => {
    const snapshot = toRuleSnapshot(
      pack({
        races: [{ ...dwarf, hasSubraces: false, subraces: {} }],
      } as never),
    );

    expect(snapshot.racesById["race_dwarf"]?.subraces).toEqual({});
  });

  it("keys classes by their id", () => {
    const snapshot = toRuleSnapshot(
      pack({
        classes: [
          {
            id: "class_barbarian",
            name: "Barbarian",
            lore: { shortDescription: "Rage." },
            hitDie: 12,
            subclassUnlockLevel: 3,
            startingEquipment: { given: [], choices: [] },
            startingProficiencyTraitIds: [],
            multiclassTraitIds: [],
            progression: [
              { level: 1, grants: ["trait_rage"], grantsASI: false },
            ],
          },
        ],
      } as never),
    );

    expect(snapshot.classesById["class_barbarian"]?.hitDie).toBe(12);
  });

  it("produces empty maps for an empty pack rather than failing", () => {
    const snapshot = toRuleSnapshot(pack());

    expect(snapshot.traitsById).toEqual({});
    expect(snapshot.racesById).toEqual({});
    expect(snapshot.classesById).toEqual({});
  });
});
