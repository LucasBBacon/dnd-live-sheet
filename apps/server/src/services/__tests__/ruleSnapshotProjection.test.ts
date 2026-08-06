import { describe, expect, it } from "vitest";
import type { ItemDefinition, WeaponDefinition } from "@project/shared";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

/**
 * A rule payload using every field ItemDefinition has. The round-trip test
 * below asserts on this object's own key list rather than a hardcoded one, so
 * adding a field to ItemDefinition makes the test fail until the projection
 * carries it.
 */
const fullItemRule: ItemDefinition = {
  id: "item_armor_plate",
  name: "Plate Armor",
  type: "armor",
  weight: 65,
  equipSlot: "body",
  requiresAttunement: true,
  ammoTag: "bolt",
  modifiers: [
    {
      target: "ARMOR_CLASS",
      type: "set_base",
      value: 18,
      scalingFactor: "none",
      maxDexCap: 0,
      requiredStates: [],
      forbiddenStates: [],
    },
  ],
};

const row = (overrides: Partial<EquipmentRuleRow> = {}): EquipmentRuleRow => ({
  id: "item_armor_plate",
  name: "Plate Armor",
  weight: 6500, // hundredths of a pound
  itemRule: fullItemRule,
  weaponRule: null,
  ...overrides,
});

describe("projectEquipmentRows", () => {
  it("returns empty maps for no rows", () => {
    const result = projectEquipmentRows([]);

    expect(result.equipmentById).toEqual({});
    expect(result.itemsById).toEqual({});
    expect(result.weaponsById).toEqual({});
    expect(result.malformedItemIds).toEqual([]);
  });

  it("carries every authored field through to the equipment map", () => {
    // the guard: asserted against the source object's own keys, so a new
    // ItemDefinition field fails this until the projection carries it
    const equipment = projectEquipmentRows([row()]).equipmentById
      .item_armor_plate;

    expect(equipment).toBeDefined();
    expect(Object.keys(equipment!).sort()).toEqual(
      expect.arrayContaining(Object.keys(fullItemRule).sort()),
    );
  });

  it("carries the individual fields the old reconstruction dropped", () => {
    const equipment = projectEquipmentRows([row()]).equipmentById
      .item_armor_plate!;

    expect(equipment.equipSlot).toBe("body");
    expect(equipment.requiresAttunement).toBe(true);
    expect(equipment.ammoTag).toBe("bolt");
    expect(equipment.modifiers).toEqual(fullItemRule.modifiers);
  });

  it("takes weight from the column and converts it to pounds", () => {
    const equipment = projectEquipmentRows([row({ weight: 6500 })])
      .equipmentById.item_armor_plate!;

    expect(equipment.weight).toBe(65);
  });

  it("prefers the column over a stale zero in the stored rule payload", () => {
    // rule payloads written before the extractor carried weight hold a 0.
    // reading the column heals them without a re-seed, so this is the
    // assertion that distinguishes the two possible sources
    const equipment = projectEquipmentRows([
      row({ weight: 6500, itemRule: { ...fullItemRule, weight: 0 } }),
    ]).equipmentById.item_armor_plate!;

    expect(equipment.weight).toBe(65);
  });

  it("mirrors the same fields into the compatibility item map", () => {
    const item = projectEquipmentRows([row()]).itemsById.item_armor_plate!;

    expect(item.weight).toBe(65);
    expect(item.equipSlot).toBe("body");
    expect(item.requiresAttunement).toBe(true);
    expect(item.ammoTag).toBe("bolt");
  });

  it("round-trips a versatile weapon without losing its two-handed die", () => {
    const weaponRule: WeaponDefinition = {
      id: "item_weapon_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
    };

    const result = projectEquipmentRows([
      row({
        id: "item_weapon_longsword",
        name: "Longsword",
        weight: 300,
        itemRule: {
          id: "item_weapon_longsword",
          name: "Longsword",
          type: "weapon",
          weight: 3,
          requiresAttunement: false,
        },
        weaponRule,
      }),
    ]);

    expect(result.weaponsById.item_weapon_longsword).toEqual(weaponRule);
    expect(result.malformedItemIds).toEqual([]);
  });

  it("leaves non-weapons out of the weapon map", () => {
    expect(projectEquipmentRows([row()]).weaponsById).toEqual({});
  });

  it("falls back to bare gear when a row has no authored rule", () => {
    const result = projectEquipmentRows([
      row({ id: "item_mystery", name: "Mystery Box", itemRule: null, weight: 250 }),
    ]);

    const equipment = result.equipmentById.item_mystery!;
    expect(equipment.type).toBe("gear");
    expect(equipment.name).toBe("Mystery Box");
    expect(equipment.weight).toBe(2.5);
    expect(result.malformedItemIds).toEqual([]);
  });

  it("skips and reports a row whose stored rule no longer parses", () => {
    // a payload written by an older schema version. one bad row must not take
    // the whole snapshot - and therefore the server - down with it
    const result = projectEquipmentRows([
      row(),
      row({
        id: "item_broken",
        itemRule: { ...fullItemRule, id: "item_broken", type: "nonsense" } as
          unknown as ItemDefinition,
      }),
    ]);

    expect(result.malformedItemIds).toEqual(["item_broken"]);
    expect(result.equipmentById.item_broken).toBeUndefined();
    // the good row still made it
    expect(result.equipmentById.item_armor_plate).toBeDefined();
  });
});
