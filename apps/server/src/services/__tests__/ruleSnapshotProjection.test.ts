import { describe, expect, it } from "vitest";
import type { ItemDefinition, WeaponDefinition } from "@project/shared";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

/**
 * A rule payload using every field ItemDefinition has, as a fixture for the
 * round-trip tests below. This is a hand-written literal, so it does not
 * grow when ItemDefinition does - see the comment on "carries every
 * authored field" for why that test cannot catch schema drift either.
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
    // a fixture round-trip, not a drift guard: it asserts the projection
    // doesn't drop any key already present on fullItemRule, but fullItemRule
    // is a hand-written literal and the assertion below is a subset check,
    // so a new ItemDefinition field changes neither side and this stays
    // green. schema drift is caught by the complementary-schemas test in
    // packages/shared/src/schemas/__tests__/equipment.test.ts instead
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

  it("throws when every row fails, because that is a contract break", () => {
    // one bad row is bad data and gets skipped. every row bad is a schema
    // change no stored payload satisfies, and returning empty maps there
    // serves a snapshot in which nothing resolves - a 200 that quietly breaks
    // every character is worse than a failure someone can see
    const broken = (id: string): EquipmentRuleRow =>
      row({
        id,
        itemRule: { ...fullItemRule, id, type: "nonsense" } as
          unknown as ItemDefinition,
      });

    expect(() =>
      projectEquipmentRows([broken("item_a"), broken("item_b")]),
    ).toThrow(/every one of 2 item rows failed to parse/);
  });

  it("still returns empty maps for no rows at all", () => {
    // the threshold must not fire on an empty catalogue: zero of zero rows
    // failing is not a contract break, it is an empty table
    expect(() => projectEquipmentRows([])).not.toThrow();
  });

  it("keys identity off the row when the payload has gone stale", () => {
    // the same argument that already governs weight: the columns are what the
    // rest of the system keys on, and item_rule is a copy that an edit to the
    // name column does not rewrite
    const result = projectEquipmentRows([
      row({
        id: "item_armor_plate",
        name: "Plate Armor",
        itemRule: {
          ...fullItemRule,
          id: "item_armour_plate_old_id",
          name: "Platemail",
        },
      }),
    ]);

    const equipment = result.equipmentById.item_armor_plate!;
    expect(equipment.id).toBe("item_armor_plate");
    expect(equipment.name).toBe("Plate Armor");
    expect(result.itemsById.item_armor_plate!.id).toBe("item_armor_plate");
    expect(result.equipmentById.item_armour_plate_old_id).toBeUndefined();
  });
});
