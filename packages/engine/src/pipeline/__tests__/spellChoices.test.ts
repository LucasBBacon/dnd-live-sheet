import { describe, expect, it } from "vitest";
import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
} from "@project/shared";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import {
  spellChoiceEntries,
  spellOptions,
  spellsKnownElsewhere,
} from "../spellChoices.js";
import { corePack, corePackLookup } from "./corePackFixture.js";

/** a real pack spell, re-levelled - the pack's own levels are all placeholder 0s */
const spell = (id: string, level: number): SpellDefinition => ({
  ...corePack().spells[0]!,
  id,
  name: id,
  level,
});

const node = (maxSpellLevel: number): SpellChoiceNode => ({
  type: "spell_choice",
  nodeId: "test_node",
  listSource: "wizard",
  maxSpellLevel,
  pickCount: 1,
});

const spellsById = Object.fromEntries(
  [
    spell("cantrip_a", 0),
    spell("first_a", 1),
    spell("second_a", 2),
    spell("third_a", 3),
    spell("cantrip_b", 0),
  ].map((entry) => [entry.id, entry]),
);

describe("spellOptions", () => {
  it("offers a cantrip node only level-0 spells, in pack order", () => {
    expect(spellOptions(node(0), { spellsById }).map((s) => s.id)).toEqual([
      "cantrip_a",
      "cantrip_b",
    ]);
  });

  it("offers any other node levels 1 through its cap, and no cantrips", () => {
    expect(spellOptions(node(2), { spellsById }).map((s) => s.id)).toEqual([
      "first_a",
      "second_a",
    ]);
  });

  it("offers nothing without spells to read", () => {
    expect(spellOptions(node(0))).toEqual([]);
  });
});

const attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const hp = { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} };

const save = (overrides: Partial<CharacterSave>): CharacterSave => ({
  attributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [],
  traitSelections: {},
  feats: [],
  hp,
  ...overrides,
});

const snapshot = corePackLookup();

const spellsOf = (characterSave: CharacterSave) => {
  const activeTraits = CharacterBootstrapper.compileActiveTraits(
    characterSave,
    snapshot,
  );
  return {
    activeTraits,
    entries: spellChoiceEntries(characterSave, activeTraits, snapshot),
  };
};

describe("spellChoiceEntries", () => {
  it("lists a class's unlocked spell nodes, then a trait's spell block, each with its stored picks", () => {
    const highElfWizard = save({
      race: {
        baseRaceId: "race_elf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: { wizard_level_1_cantrips: ["spell_dancing_lights"] },
        },
      ],
      traitSelections: { high_elf_cantrip: ["spell_minor_illusion"] },
    });

    const { entries } = spellsOf(highElfWizard);

    expect(
      entries.map((entry) => [entry.target, entry.node.nodeId, entry.selected]),
    ).toEqual([
      ["class", "wizard_level_1_cantrips", ["spell_dancing_lights"]],
      ["class", "wizard_level_1_spellbook", []],
      ["trait", "high_elf_cantrip", ["spell_minor_illusion"]],
    ]);
  });

  it("leaves out spell nodes above the class's level", () => {
    const { entries } = spellsOf(
      save({ classes: [{ classId: "class_cleric", level: 3, selections: {} }] }),
    );

    expect(entries.map((entry) => entry.node.nodeId)).toEqual([
      "cleric_level_1_cantrips",
    ]);
  });
});

describe("spellsKnownElsewhere", () => {
  it("counts every trait's fixed spells and every other choice's picks, but not the choice's own", () => {
    const tieflingWizard = save({
      race: { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null },
      classes: [
        {
          classId: "class_wizard",
          level: 1,
          selections: {
            wizard_level_1_cantrips: ["spell_dancing_lights"],
            wizard_level_1_spellbook: ["spell_bless"],
          },
        },
      ],
    });
    const { activeTraits, entries } = spellsOf(tieflingWizard);

    const known = spellsKnownElsewhere(
      entries,
      activeTraits,
      "wizard_level_1_cantrips",
    );

    // Infernal Legacy's three fixed spells, and the spellbook's pick
    expect([...known]).toEqual(
      expect.arrayContaining([
        "spell_thaumaturgy",
        "spell_hellish_rebuke",
        "spell_darkness",
        "spell_bless",
      ]),
    );
    expect(known.has("spell_dancing_lights")).toBe(false);
  });
});
