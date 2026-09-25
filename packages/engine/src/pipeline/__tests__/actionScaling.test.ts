import { describe, expect, it } from "vitest";
import type { ActionGrant, DamageSegment } from "@project/shared";
import {
  resolveActionScaling,
  resolveSegmentDice,
  upcastDice,
} from "../actionScaling.js";

const breath: DamageSegment = {
  sourceName: "Black Dragon Breath",
  baseDice: "2d6",
  damageType: "acid",
  scalingMode: "total_level",
  levelScaling: [
    { levelRequired: 6, newDice: "3d6" },
    { levelRequired: 11, newDice: "4d6" },
    { levelRequired: 16, newDice: "5d6" },
  ],
};

const at = (total: number, classes: Record<string, number> = {}) => ({
  total,
  classes,
});

describe("resolveSegmentDice", () => {
  it.each([
    [1, "2d6"],
    [5, "2d6"],
    [6, "3d6"],
    [11, "4d6"],
    [20, "5d6"],
  ])("rolls a level-%i breath as %s", (level, dice) => {
    expect(resolveSegmentDice(breath, at(level)).baseDice).toBe(dice);
  });

  it("reads one class's level for a class-scaled segment", () => {
    const segment: DamageSegment = {
      ...breath,
      scalingMode: "class_level",
      scalingClassId: "class_monk",
    };

    expect(resolveSegmentDice(segment, at(11, { class_monk: 5 })).baseDice).toBe("2d6");
    expect(resolveSegmentDice(segment, at(11, { class_monk: 6 })).baseDice).toBe("3d6");
  });

  it("leaves an unscaled segment exactly as it is", () => {
    const flat: DamageSegment = { ...breath, scalingMode: "none" };

    expect(resolveSegmentDice(flat, at(20))).toBe(flat);
  });

  it("never writes through to the segment it was given", () => {
    resolveSegmentDice(breath, at(20));

    expect(breath.baseDice).toBe("2d6");
  });
});

describe("resolveActionScaling", () => {
  const breathWeapon: ActionGrant = {
    id: "action_black_breath",
    name: "Breath Weapon",
    activation: "action",
    effect: {
      type: "save",
      savingThrow: {
        targetStat: "DEX",
        dcCalculation: { base: 8, scalingStat: "CON", includeProficiency: true },
        saveEffect: "half_damage",
      },
      damage: [breath],
    },
  };

  it("scales a save's damage and leaves the pack's action untouched", () => {
    const resolved = resolveActionScaling(breathWeapon, at(11));

    expect(resolved.effect.type === "save" && resolved.effect.damage?.[0]?.baseDice).toBe("4d6");
    expect(breathWeapon.effect.type === "save" && breathWeapon.effect.damage?.[0]?.baseDice).toBe("2d6");
  });

  it("scales the effects inside a macro", () => {
    if (breathWeapon.effect.type !== "save") throw new Error("expected a save");
    const macro: ActionGrant = {
      ...breathWeapon,
      effect: { type: "macro", effects: [breathWeapon.effect] },
    };
    const resolved = resolveActionScaling(macro, at(16));
    const nested =
      resolved.effect.type === "macro" ? resolved.effect.effects[0] : undefined;

    expect(nested?.type === "save" && nested.damage?.[0]?.baseDice).toBe("5d6");
  });
});

describe("upcastDice", () => {
  const burning: DamageSegment = {
    sourceName: "Burning Hands",
    baseDice: "3d6",
    damageType: "fire",
    scalingMode: "none",
    levelScaling: [],
    perSlotAbove: "1d6",
  };
  const plain: DamageSegment = {
    sourceName: "Burning Hands",
    baseDice: "3d6",
    damageType: "fire",
    scalingMode: "none",
    levelScaling: [],
  };

  it("adds a die per slot level above the spell's own", () => {
    expect(upcastDice(burning, { spellLevel: 1, castLevel: 1 })).toBe("3d6");
    expect(upcastDice(burning, { spellLevel: 1, castLevel: 3 })).toBe("5d6");
  });

  it("keeps a flat modifier", () => {
    expect(upcastDice({ ...burning, baseDice: "3d6+2" }, { spellLevel: 1, castLevel: 2 })).toBe("4d6+2");
  });

  it("adds nothing without a cast, or without dice to add", () => {
    expect(upcastDice(burning, undefined)).toBe("3d6");
    expect(upcastDice(plain, { spellLevel: 1, castLevel: 3 })).toBe("3d6");
  });
});
