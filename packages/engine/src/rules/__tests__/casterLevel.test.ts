import { describe, expect, it } from "vitest";
import { casterLevel, collectCastingSources, type CastingSource } from "../casterLevel.js";

const source = (
  classId: string,
  level: number,
  progression: CastingSource["progression"],
): CastingSource => ({ classId, level, progression, ability: "INT" });

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

  it("rounds a lone third-caster up", () => {
    expect(casterLevel([source("class_fighter", 3, "third")])).toBe(1);
    expect(casterLevel([source("class_fighter", 4, "third")])).toBe(2);
    expect(casterLevel([source("class_fighter", 7, "third")])).toBe(3);
    expect(casterLevel([source("class_fighter", 20, "third")])).toBe(7);
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

  // PHB p.164 rounds each contribution down, and the two rules genuinely
  // disagree: one ranger level costs this paladin a caster level
  it("rounds each half-caster down, which can lower the total", () => {
    expect(casterLevel([source("class_paladin", 5, "half")])).toBe(3);
    expect(
      casterLevel([
        source("class_paladin", 5, "half"),
        source("class_ranger", 1, "half"),
      ]),
    ).toBe(2);
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
        spellcasting: { ability: "INT" as const, progression: "full" as const },
      },
      class_fighter: { id: "class_fighter" },
      class_barbarian: { id: "class_barbarian" },
    },
    subclassesById: {
      subclass_fighter_eldritch_knight: {
        id: "subclass_fighter_eldritch_knight",
        spellcasting: { ability: "INT" as const, progression: "third" as const },
      },
    },
  } as never;

  it("reads the class's own declaration", () => {
    expect(
      collectCastingSources({ class_wizard: 5 }, {}, snapshot),
    ).toEqual([
      { classId: "class_wizard", level: 5, progression: "full", ability: "INT" },
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
      { classId: "class_fighter", level: 7, progression: "third", ability: "INT" },
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
});
