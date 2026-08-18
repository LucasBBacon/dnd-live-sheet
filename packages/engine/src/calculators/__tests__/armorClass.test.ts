import { describe, expect, it } from "vitest";
import { DerivedStatEngine } from "../derivedStats.js";
import type { RuntimeModifier } from "@project/shared";

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "ARMOR_CLASS",
  type: "add",
  value: 0,
  scalingFactor: "none",
  requiredStates: [],
  forbiddenStates: [],
  sourceName: "Test Source",
  sourceOrigin: "item",
  isActive: true,
  ...overrides,
});

describe("DerivedStatEngine.calculateAC", () => {
  it("uses unarmored baseline when no AC modifiers exist", () => {
    const result = DerivedStatEngine.calculateAC(3, []);

    expect(result.total).toBe(13);
    expect(result.breakdown).toEqual([
      { name: "Base AC (Unarmored)", value: 10 },
      { name: "Dexterity Modifier", value: "+3" },
    ]);
  });

  it("uses the highest set_base AC modifier", () => {
    const result = DerivedStatEngine.calculateAC(2, [
      makeMod({
        id: "mage_armor",
        type: "set_base",
        value: 13,
        sourceName: "Mage Armor",
      }),
      makeMod({
        id: "plate",
        type: "set_base",
        value: 18,
        sourceName: "Plate Armor",
      }),
    ]);

    expect(result.total).toBe(20);
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        { name: "Base AC (Plate Armor)", value: 18 },
        {
          name: "Mage Armor",
          value: "Ignored (Does not stack)",
          isIgnored: true,
        },
      ]),
    );
  });

  it("applies unique add modifiers and ignores duplicate source names", () => {
    const result = DerivedStatEngine.calculateAC(1, [
      makeMod({ id: "shield_1", sourceName: "Shield", value: 2 }),
      makeMod({ id: "shield_2", sourceName: "Shield", value: 2 }),
      makeMod({ id: "ring", sourceName: "Ring of Protection", value: 1 }),
    ]);

    expect(result.total).toBe(14);
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        { name: "Shield", value: "+2" },
        {
          name: "Shield",
          value: "Ignored (Duplicate)",
          isIgnored: true,
        },
        { name: "Ring of Protection", value: "+1" },
      ]),
    );
  });

  it("ignores inactive AC modifiers and non-AC modifiers", () => {
    const result = DerivedStatEngine.calculateAC(0, [
      makeMod({ id: "inactive", value: 4, isActive: false }),
      makeMod({ id: "stealth_dis", target: "STEALTH_CHECK", value: 999 }),
      makeMod({ id: "active", sourceName: "Shield", value: 2 }),
    ]);

    expect(result.total).toBe(12);
    expect(result.breakdown).toEqual([
      { name: "Base AC (Unarmored)", value: 10 },
      { name: "Shield", value: "+2" },
    ]);
  });

  it("handles negative dexterity modifiers and negative adders", () => {
    const result = DerivedStatEngine.calculateAC(-2, [
      makeMod({ id: "curse", sourceName: "Cursed Aura", value: -1 }),
    ]);

    expect(result.total).toBe(7);
    expect(result.breakdown).toEqual([
      { name: "Base AC (Unarmored)", value: 10 },
      { name: "Dexterity Modifier", value: "-2" },
      { name: "Cursed Aura", value: "-1" },
    ]);
  });

  it("evaluates an ability-sum AC formula and reports its components", () => {
    const result = DerivedStatEngine.calculateAC(
      { STR: 0, DEX: 3, CON: 4, INT: 0, WIS: 0, CHA: 0 },
      [
        makeMod({
          id: "barbarian_unarmored_defense",
          type: "set_base",
          value: 10,
          formula: {
            kind: "ability_sum",
            base: 10,
            abilities: ["DEX", "CON"],
          },
          sourceName: "Unarmored Defense (Barbarian)",
          forbiddenStates: ["status_wearing_armor"],
        }),
      ],
    );

    expect(result.total).toBe(17);
    expect(result.breakdown).toEqual([
      { name: "Base AC (Unarmored Defense (Barbarian))", value: 10 },
      { name: "Dexterity Modifier", value: "+3" },
      { name: "Constitution Modifier", value: "+4" },
    ]);
  });

  it("suppresses an ability-sum AC formula while armour is equipped", () => {
    const result = DerivedStatEngine.calculateAC(
      { STR: 0, DEX: 3, CON: 4, INT: 0, WIS: 0, CHA: 0 },
      [
        makeMod({
          id: "barbarian_unarmored_defense",
          type: "set_base",
          value: 10,
          formula: {
            kind: "ability_sum",
            base: 10,
            abilities: ["DEX", "CON"],
          },
          sourceName: "Unarmored Defense (Barbarian)",
          forbiddenStates: ["status_wearing_armor"],
        }),
        makeMod({
          id: "leather",
          type: "set_base",
          value: 11,
          sourceName: "Leather Armour",
        }),
      ],
      ["status_wearing_armor"],
    );

    expect(result.total).toBe(14);
    expect(result.breakdown).toContainEqual({
      name: "Base AC (Leather Armour)",
      value: 11,
    });
  });
});
