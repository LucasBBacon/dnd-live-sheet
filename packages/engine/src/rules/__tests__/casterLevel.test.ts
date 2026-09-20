import { describe, expect, it } from "vitest";
import { casterLevel, collectCastingSources, type CastingSource } from "../casterLevel.js";
import { corePackLookup } from "../../pipeline/__tests__/corePackFixture.js";
import { SpellcastingEngine } from "../../calculators/spellcasting.js";

// The level each progression actually gains Spellcasting at, per the PHB -
// the same numbers the pack authors on Spellcasting.startsAtLevel. Used as
// this file's default so most hand-built sources need not repeat it; a test
// that cares about the threshold itself passes startsAtLevel explicitly.
const DEFAULT_START_LEVEL: Record<CastingSource["progression"], number> = {
  full: 1,
  half: 2,
  third: 3,
  pact: 1,
};

const source = (
  classId: string,
  level: number,
  progression: CastingSource["progression"],
  startsAtLevel: number = DEFAULT_START_LEVEL[progression],
): CastingSource => ({ classId, level, progression, ability: "INT", startsAtLevel });

describe("casterLevel - a single casting class reads its own table", () => {
  it("is zero for a character that casts nothing", () => {
    expect(casterLevel([])).toBe(0);
  });

  it("gives a full caster its own level", () => {
    expect(casterLevel([source("class_wizard", 1, "full")])).toBe(1);
    expect(casterLevel([source("class_wizard", 20, "full")])).toBe(20);
  });

  // a lone paladin's table is the full-caster table read at ceil(level / 2):
  // paladin 5 has four first-level and two second-level slots, which is what a
  // full caster has at level 3
  it("rounds a lone half-caster up", () => {
    expect(casterLevel([source("class_paladin", 2, "half")])).toBe(1);
    expect(casterLevel([source("class_paladin", 5, "half")])).toBe(3);
    expect(casterLevel([source("class_paladin", 9, "half")])).toBe(5);
    expect(casterLevel([source("class_paladin", 20, "half")])).toBe(10);
  });

  // a level-1 paladin has no Spellcasting feature at all - the PHB table's
  // first row is level 2, which is this file's DEFAULT_START_LEVEL for
  // "half". casterLevel drops a source below its own startsAtLevel before it
  // can contribute anything, rather than hand-rounding it to a wrong nonzero
  // caster level.
  it("gives a lone half-caster nothing before the class casts at all", () => {
    expect(casterLevel([source("class_paladin", 1, "half")])).toBe(0);
  });

  it("rounds a lone third-caster up", () => {
    expect(casterLevel([source("class_fighter", 3, "third")])).toBe(1);
    expect(casterLevel([source("class_fighter", 4, "third")])).toBe(2);
    expect(casterLevel([source("class_fighter", 7, "third")])).toBe(3);
    expect(casterLevel([source("class_fighter", 20, "third")])).toBe(7);
  });

  // same guard as the half-caster case, at the Eldritch Knight/Arcane
  // Trickster threshold: nothing before level 3.
  it("gives a lone third-caster nothing before the class casts at all", () => {
    expect(casterLevel([source("class_fighter", 1, "third")])).toBe(0);
    expect(casterLevel([source("class_fighter", 2, "third")])).toBe(0);
  });

  // casterLevel does not know "half starts at 2" on its own - it only knows
  // what each source's own startsAtLevel says. A caller that hands it a
  // source claiming an earlier start gets computed accordingly; the real
  // guard against a class starting earlier than the PHB allows lives in
  // collectCastingSources, which is the only place a source is built from
  // pack data rather than by hand.
  it("trusts a source's own startsAtLevel rather than a hardcoded minimum", () => {
    expect(casterLevel([source("class_paladin", 1, "half", 1)])).toBe(1);
  });
});

describe("casterLevel - several casting classes use the multiclass rule", () => {
  it("adds full levels outright", () => {
    expect(
      casterLevel([
        source("class_wizard", 3, "full"),
        source("class_cleric", 3, "full"),
      ]),
    ).toBe(6);
  });

  // PHB p.164 rounds each contribution down when several classes actually
  // cast - but a class only counts toward "several" once it has actually
  // gained Spellcasting. A ranger 1 has not (its table starts at level 2, and
  // this file's source() defaults startsAtLevel to that), so casterLevel
  // drops it before ever deciding alone-vs-shared: what is left is a lone
  // paladin 5, which reads its own table at ceil(5 / 2) = 3, not
  // floor(5 / 2) + floor(1 / 2) = 2.
  it("rounds each half-caster down, which can lower the total, once a class has actually started casting", () => {
    expect(casterLevel([source("class_paladin", 5, "half")])).toBe(3);
    expect(
      casterLevel([
        source("class_paladin", 5, "half"),
        source("class_ranger", 1, "half"),
      ]),
    ).toBe(3);
  });

  it("rounds a third-caster down alongside another caster", () => {
    expect(
      casterLevel([
        source("class_fighter", 7, "third"),
        source("class_wizard", 1, "full"),
      ]),
    ).toBe(3);
  });
});

describe("casterLevel - pact magic never contributes", () => {
  it("is zero for a warlock alone", () => {
    expect(casterLevel([source("class_warlock", 5, "pact")])).toBe(0);
  });

  it("leaves a single other caster counted as a single caster", () => {
    expect(
      casterLevel([
        source("class_warlock", 5, "pact"),
        source("class_paladin", 5, "half"),
      ]),
    ).toBe(3);
  });
});

describe("collectCastingSources", () => {
  const snapshot = {
    classesById: {
      class_wizard: {
        id: "class_wizard",
        spellcasting: {
          ability: "INT" as const,
          progression: "full" as const,
          startsAtLevel: 1,
        },
      },
      class_paladin: {
        id: "class_paladin",
        spellcasting: {
          ability: "CHA" as const,
          progression: "half" as const,
          startsAtLevel: 2,
        },
      },
      class_fighter: { id: "class_fighter" },
      class_barbarian: { id: "class_barbarian" },
    },
    subclassesById: {
      subclass_fighter_eldritch_knight: {
        id: "subclass_fighter_eldritch_knight",
        spellcasting: {
          ability: "INT" as const,
          progression: "third" as const,
          startsAtLevel: 3,
        },
      },
    },
  } as never;

  it("reads the class's own declaration", () => {
    expect(
      collectCastingSources({ class_wizard: 5 }, {}, snapshot),
    ).toEqual([
      {
        classId: "class_wizard",
        level: 5,
        progression: "full",
        ability: "INT",
        startsAtLevel: 1,
      },
    ]);
  });

  it("falls back to the subclass, at the class's level", () => {
    expect(
      collectCastingSources(
        { class_fighter: 7 },
        { class_fighter: "subclass_fighter_eldritch_knight" },
        snapshot,
      ),
    ).toEqual([
      {
        classId: "class_fighter",
        level: 7,
        progression: "third",
        ability: "INT",
        startsAtLevel: 3,
      },
    ]);
  });

  it("ignores a class that declares nothing", () => {
    expect(collectCastingSources({ class_barbarian: 5 }, {}, snapshot)).toEqual([]);
  });

  it("ignores a fighter with no subclass chosen", () => {
    expect(collectCastingSources({ class_fighter: 2 }, {}, snapshot)).toEqual([]);
  });

  it("returns nothing without a snapshot", () => {
    expect(collectCastingSources({ class_wizard: 5 }, {})).toEqual([]);
  });

  // class_paladin declares progression: "half" on the class itself with no
  // level test of its own - without this check, a level-1 paladin would
  // produce a source and the sheet would show a spell save DC and attack
  // bonus a full level before the class actually has Spellcasting.
  it("drops a class below its own declared startsAtLevel", () => {
    expect(collectCastingSources({ class_paladin: 1 }, {}, snapshot)).toEqual([]);
  });

  it("keeps a class once it reaches its declared startsAtLevel", () => {
    expect(collectCastingSources({ class_paladin: 2 }, {}, snapshot)).toEqual([
      {
        classId: "class_paladin",
        level: 2,
        progression: "half",
        ability: "CHA",
        startsAtLevel: 2,
      },
    ]);
  });

  describe("against the real pack", () => {
    const realSnapshot = corePackLookup();

    // class_paladin and class_ranger both declare progression: "half" on the
    // class itself, and both gain Spellcasting at level 2 - this is the exact
    // seam the whole-branch review found: nothing upstream of
    // collectCastingSources gated on that, so a level-1 paladin or ranger
    // used to show a spell save DC and attack bonus with no Spellcasting
    // feature to back it.
    it("produces no source for a level-1 paladin", () => {
      expect(
        collectCastingSources({ class_paladin: 1 }, {}, realSnapshot),
      ).toEqual([]);
    });

    it("produces no source for a level-1 ranger", () => {
      expect(
        collectCastingSources({ class_ranger: 1 }, {}, realSnapshot),
      ).toEqual([]);
    });

    it("produces a source once the paladin reaches level 2", () => {
      const sources = collectCastingSources(
        { class_paladin: 2 },
        {},
        realSnapshot,
      );
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ classId: "class_paladin", level: 2 });
    });
  });
});

describe("SpellcastingEngine.calculate has no entry for a class that has not started casting", () => {
  const realSnapshot = corePackLookup();
  const abilityScores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 16 };

  it("yields nothing for a level-1 paladin", () => {
    const sources = collectCastingSources(
      { class_paladin: 1 },
      {},
      realSnapshot,
    );

    expect(
      SpellcastingEngine.calculate(sources, abilityScores, 2, []),
    ).toEqual([]);
  });

  it("yields nothing for a level-1 ranger", () => {
    const sources = collectCastingSources({ class_ranger: 1 }, {}, realSnapshot);

    expect(
      SpellcastingEngine.calculate(sources, abilityScores, 2, []),
    ).toEqual([]);
  });
});
