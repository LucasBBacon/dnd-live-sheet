import { describe, expect, it } from "vitest";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";
import {
  buildLevelContext,
  collectGrantedResources,
  getResourceMaxUses,
} from "../../utils/resourceRules.js";

/**
 * The PHB tables, read out of the shipped pack rather than restated here.
 * A mis-authored threshold fails this; it cannot be papered over by writing
 * the same mistake into the expectation.
 */
const snapshot = corePackSnapshot();

const slotsFor = (
  traitId: string,
  classId: string,
  level: number,
  subclassId?: string,
): number[] => {
  const trait = snapshot.traitsById[traitId];
  if (!trait) throw new Error(`${traitId} missing from the shipped pack`);
  const granted = collectGrantedResources([trait], { resourcesById: {} });
  const levels = buildLevelContext(
    { [classId]: level },
    subclassId ? { [classId]: subclassId } : {},
    { classesById: snapshot.classesById, subclassesById: snapshot.subclassesById },
  );

  return Array.from({ length: 9 }, (_, index) => {
    const pool = granted.find((entry) => entry.id === `spell_slots_${index + 1}`);
    return pool ? getResourceMaxUses(pool, levels) : 0;
  });
};

describe("the authored slot tables match the PHB", () => {
  it("a wizard 5 has 4/3/2", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 5)).toEqual([
      4, 3, 2, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a wizard 1 has two first-level slots and nothing else", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 1)).toEqual([
      2, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a wizard 20 has 4/3/3/3/3/2/2/1/1", () => {
    expect(slotsFor("trait_spellcasting_wizard", "class_wizard", 20)).toEqual([
      4, 3, 3, 3, 3, 2, 2, 1, 1,
    ]);
  });

  it("a paladin 5 has 4/2, which is a full caster's level 3", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 5)).toEqual([
      4, 2, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("a paladin 20 tops out at two fifth-level slots", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 20)).toEqual([
      4, 3, 3, 3, 2, 0, 0, 0, 0,
    ]);
  });

  it("a paladin 1 has no slots at all", () => {
    expect(slotsFor("trait_spellcasting_paladin", "class_paladin", 1)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("an eldritch knight 3 has two first-level slots", () => {
    const slots = slotsFor(
      "trait_fighter_eldritch_knight_spellcasting",
      "class_fighter",
      3,
      "subclass_fighter_eldritch_knight",
    );

    expect(slots[0]).toBe(2);
  });

  it("an eldritch knight with no subclass chosen has none", () => {
    expect(
      slotsFor("trait_fighter_eldritch_knight_spellcasting", "class_fighter", 3),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("pact magic is its own table", () => {
  const pactPool = (poolId: string, level: number): number => {
    const trait = snapshot.traitsById["trait_pact_magic"];
    if (!trait) throw new Error("trait_pact_magic missing from the shipped pack");
    const granted = collectGrantedResources([trait], { resourcesById: {} });
    const pool = granted.find((entry) => entry.id === poolId);
    if (!pool) throw new Error(`trait_pact_magic grants no ${poolId}`);

    return getResourceMaxUses(
      pool,
      buildLevelContext({ class_warlock: level }, {}, {
        classesById: snapshot.classesById,
        subclassesById: snapshot.subclassesById,
      }),
    );
  };

  it("gives one slot at 1, two at 2, three at 11 and four at 17", () => {
    expect(pactPool("pact_slots", 1)).toBe(1);
    expect(pactPool("pact_slots", 2)).toBe(2);
    expect(pactPool("pact_slots", 10)).toBe(2);
    expect(pactPool("pact_slots", 11)).toBe(3);
    expect(pactPool("pact_slots", 17)).toBe(4);
  });

  it("raises the slot level every two warlock levels to a cap of five", () => {
    expect(pactPool("pact_slot_level", 1)).toBe(1);
    expect(pactPool("pact_slot_level", 3)).toBe(2);
    expect(pactPool("pact_slot_level", 5)).toBe(3);
    expect(pactPool("pact_slot_level", 7)).toBe(4);
    expect(pactPool("pact_slot_level", 9)).toBe(5);
    expect(pactPool("pact_slot_level", 20)).toBe(5);
  });

  it("does not contribute to caster level", () => {
    expect(
      buildLevelContext({ class_warlock: 20 }, {}, {
        classesById: snapshot.classesById,
        subclassesById: snapshot.subclassesById,
      }).casterLevel,
    ).toBe(0);
  });

  // A solo warlock reads caster level 0 for two different reasons depending
  // on whether class_warlock.spellcasting is authored at all: with no
  // spellcasting field, collectCastingSources never produces a source in the
  // first place; with it authored (this task), casterLevel's own pact filter
  // is what drops the source. The assertion above cannot tell those apart.
  // A multiclass warlock/wizard can: only casterLevel's pact filter, not the
  // presence check, keeps a second (pact) source out of the sum, so a
  // warlock 20 / wizard 5 must read caster level 5 - the wizard's alone
  // contribution - not 25, and not a wizard contribution computed under the
  // "shared" branch (moot here, since a full caster's alone and shared
  // formulas are identical, but the point is that only one source is summed
  // at all).
  it("does not join a wizard's levels into caster level on a multiclass warlock", () => {
    expect(
      buildLevelContext({ class_warlock: 20, class_wizard: 5 }, {}, {
        classesById: snapshot.classesById,
        subclassesById: snapshot.subclassesById,
      }).casterLevel,
    ).toBe(5);
  });
});
