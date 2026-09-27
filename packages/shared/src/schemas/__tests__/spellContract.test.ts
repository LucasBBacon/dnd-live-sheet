import { describe, expect, it } from "vitest";
import {
  ActionEffectSchema,
  AttackEffectSchema,
  DamageSegmentSchema,
  SaveEffectSchema,
} from "../content/actions.js";
import {
  FixedSpellGrantSchema,
  ROUNDS_PER_DURATION_UNIT,
  SpellDefinitionSchema,
  SpellDurationSchema,
  SpellRangeSchema,
} from "../content/spells.js";

const beamAttack = {
  type: "attack",
  attackType: "ranged_spell",
  attackStat: "SPELLCASTING_MOD",
  range: 120,
  repeat: {
    label: "Beam",
    thresholds: [
      { minimumLevel: 1, value: 1 },
      { minimumLevel: 5, value: 2 },
    ],
  },
  damage: [
    { sourceName: "Eldritch Blast", baseDice: "1d10", damageType: "force" },
  ],
};

const eldritchBlast = {
  id: "spell_eldritch_blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  isRitual: false,
  lore: { shortDescription: "A beam of crackling energy." },
  range: { kind: "feet", feet: 120 },
  components: { verbal: true, somatic: true, material: false },
  duration: { kind: "instantaneous" },
  action: {
    id: "action_spell_eldritch_blast",
    name: "Eldritch Blast",
    activation: "action",
    effect: beamAttack,
  },
};

describe("the spell contract", () => {
  it("accepts a spell with its casting metadata", () => {
    const spell = SpellDefinitionSchema.parse(eldritchBlast);

    expect(spell.range).toEqual({ kind: "feet", feet: 120 });
    expect(spell.duration).toEqual({ kind: "instantaneous" });
    expect(spell.components).toMatchObject({
      verbal: true,
      somatic: true,
      material: false,
    });
    expect(spell.lore?.shortDescription).toBe("A beam of crackling energy.");
  });

  it("still accepts a stub that carries none of it", () => {
    expect(() =>
      SpellDefinitionSchema.parse({
        id: "spell_darkness",
        name: "Darkness",
        level: 0,
        school: "evocation",
        isRitual: false,
        action: {
          id: "action_spell_darkness",
          name: "Darkness",
          activation: "action",
          effect: { type: "no_effect" },
        },
        implementation: { mode: "unimplemented", summary: "Awaiting authoring." },
      }),
    ).not.toThrow();
  });

  it("carries a self range with its area", () => {
    expect(
      SpellRangeSchema.parse({ kind: "self", area: { shape: "cone", size: 15 } }),
    ).toEqual({ kind: "self", area: { shape: "cone", size: 15 } });
  });

  // Identify and Nondetection: a touch spell has no area
  it("carries a touch range", () => {
    expect(SpellRangeSchema.parse({ kind: "touch" })).toEqual({ kind: "touch" });
    expect(() =>
      SpellRangeSchema.parse({ kind: "touch", area: { shape: "sphere", size: 5 } }),
    ).toThrow();
  });

  it("requires a timed duration to say whether it is concentration", () => {
    expect(() =>
      SpellDurationSchema.parse({ kind: "timed", amount: 1, unit: "minute" }),
    ).toThrow();
    expect(
      SpellDurationSchema.parse({
        kind: "timed",
        amount: 1,
        unit: "minute",
        concentration: true,
      }),
    ).toEqual({ kind: "timed", amount: 1, unit: "minute", concentration: true });
  });

  it("counts rounds in each duration unit: a round is six seconds", () => {
    expect(ROUNDS_PER_DURATION_UNIT).toEqual({ round: 1, minute: 10, hour: 600 });
  });

  // Command lasts a round; Suggestion and Nondetection, eight hours
  it("lasts rounds and hours as well as minutes, and nothing else", () => {
    for (const unit of ["round", "hour"]) {
      expect(
        SpellDurationSchema.parse({ kind: "timed", amount: 8, unit, concentration: false }),
      ).toEqual({ kind: "timed", amount: 8, unit, concentration: false });
    }
    expect(() =>
      SpellDurationSchema.parse({
        kind: "timed",
        amount: 1,
        unit: "day",
        concentration: false,
      }),
    ).toThrow();
  });

  // Infernal Legacy casts Hellish Rebuke "as a 2nd-level spell"
  it("lets a fixed grant cast its spell at a set level, from 1st to 9th", () => {
    const grant = {
      type: "fixed_spell",
      spellId: "spell_hellish_rebuke",
      castingStat: "CHA",
      unlockLevel: 3,
      usage: { kind: "resource", resourceId: "infernal_legacy_hellish_rebuke" },
    };

    expect(FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 2 }).castAtLevel).toBe(2);
    expect(FixedSpellGrantSchema.parse(grant).castAtLevel).toBeUndefined();
    expect(() => FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 0 })).toThrow();
    expect(() => FixedSpellGrantSchema.parse({ ...grant, castAtLevel: 10 })).toThrow();
  });

  it("ladders an attack's repeat by level, and needs at least one rung", () => {
    expect(AttackEffectSchema.parse(beamAttack).repeat?.thresholds).toHaveLength(2);
    expect(() =>
      AttackEffectSchema.parse({
        ...beamAttack,
        repeat: { label: "Beam", thresholds: [] },
      }),
    ).toThrow();
  });

  it("accepts dice added per slot level on a damage segment", () => {
    const segment = DamageSegmentSchema.parse({
      sourceName: "Burning Hands",
      baseDice: "3d6",
      damageType: "fire",
      perSlotAbove: "1d6",
    });

    expect(segment.perSlotAbove).toBe("1d6");
    expect(() =>
      DamageSegmentSchema.parse({
        sourceName: "Burning Hands",
        baseDice: "3d6",
        damageType: "fire",
        perSlotAbove: "",
      }),
    ).toThrow();
  });

  it("lets a save carry the DC it was resolved to", () => {
    const save = SaveEffectSchema.parse({
      type: "save",
      savingThrow: {
        targetStat: "DEX",
        dcCalculation: {
          base: 8,
          scalingStat: "SPELLCASTING_MOD",
          includeProficiency: true,
        },
        saveEffect: "half_damage",
        dc: 13,
      },
    });

    expect(save.savingThrow.dc).toBe(13);
  });

  it("has an effect that ends concentration", () => {
    expect(ActionEffectSchema.parse({ type: "end_concentration" })).toEqual({
      type: "end_concentration",
    });
  });
});
