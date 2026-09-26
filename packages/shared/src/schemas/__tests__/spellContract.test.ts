import { describe, expect, it } from "vitest";
import {
  ActionEffectSchema,
  AttackEffectSchema,
  DamageSegmentSchema,
  SaveEffectSchema,
} from "../content/actions.js";
import {
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

  // no range kind before a spell needs it
  it("has no touch range yet", () => {
    expect(() => SpellRangeSchema.parse({ kind: "touch" })).toThrow();
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

  it("counts ten rounds to the minute", () => {
    expect(ROUNDS_PER_DURATION_UNIT.minute).toBe(10);
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
