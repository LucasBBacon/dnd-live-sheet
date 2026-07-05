import { describe, expect, it } from "vitest";
import { DerivedStatEngine } from "../armorClass";
import type { RuntimeModifier } from "@project/shared";

const makeMod = (overrides: Partial<RuntimeModifier>): RuntimeModifier => ({
  id: "mod_1",
  target: "AC",
  type: "add",
  value: 0,
  sourceName: "Test Source",
  sourceOrigin: "Item",
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
      { name: "Dexterity Modifier", value: "+0" },
    ]);
  });

  it("handles negative dexterity modifiers and negative adders", () => {
    const result = DerivedStatEngine.calculateAC(-2, [
      makeMod({ id: "curse", sourceName: "Cursed Aura", value: -1 }),
    ]);

    expect(result.total).toBe(7);
    expect(result.breakdown).toEqual([
      { name: "Base AC (Unarmored)", value: 10 },
      { name: "Cursed Aura", value: "+-1" },
      { name: "Dexterity Modifier", value: "+-2" },
    ]);
  });
});
