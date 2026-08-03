import { describe, expect, it } from "vitest";
import type { CharacterSlot } from "@project/shared";
import {
  EQUIPMENT_DICTIONARY,
  ITEM_DICTIONARY,
} from "../equipmentDictionary.js";
import {
  SLOT_INSTANCES,
  canEquipTo,
  firstFreeSlot,
  isEquipped,
  slotCapacity,
  slotsConsumedBy,
} from "../equipSlots.js";

const definition = (id: string) => {
  const item = ITEM_DICTIONARY[id];
  if (!item) throw new Error(`ITEM_DICTIONARY is missing ${id}`);
  return item;
};

const equipment = (id: string) => {
  const item = EQUIPMENT_DICTIONARY[id];
  if (!item) throw new Error(`EQUIPMENT_DICTIONARY is missing ${id}`);
  return item;
};

describe("slot capacity", () => {
  it("gives the character two ring fingers and one of everything else", () => {
    expect(slotCapacity("ring")).toBe(2);
    expect(SLOT_INSTANCES.ring).toEqual(["ring_1", "ring_2"]);

    for (const kind of ["head", "body", "main_hand", "boots"] as const) {
      expect(slotCapacity(kind), kind).toBe(1);
    }
  });

  it("treats the backpack as carried rather than worn", () => {
    expect(isEquipped("backpack")).toBe(false);
    expect(isEquipped("ring_1")).toBe(true);
    expect(isEquipped("body")).toBe(true);
  });
});

describe("canEquipTo", () => {
  it("lets a ring go on either finger but nowhere else", () => {
    const ring = definition("item_ring_of_protection");

    expect(canEquipTo(ring, "ring_1")).toBe(true);
    expect(canEquipTo(ring, "ring_2")).toBe(true);
    // the bug this whole model exists to fix: a ring is not body armor
    expect(canEquipTo(ring, "body")).toBe(false);
    expect(canEquipTo(ring, "main_hand")).toBe(false);
  });

  it("routes a shield to the off hand without special-casing its id", () => {
    const shield = definition("item_armor_shield");

    expect(canEquipTo(shield, "off_hand")).toBe(true);
    expect(canEquipTo(shield, "body")).toBe(false);
  });

  it("routes body armor to the body slot", () => {
    const plate = definition("item_armor_plate");

    expect(canEquipTo(plate, "body")).toBe(true);
    expect(canEquipTo(plate, "off_hand")).toBe(false);
  });

  it("always allows returning an item to the pack", () => {
    expect(canEquipTo(definition("item_armor_plate"), "backpack")).toBe(true);
    // even something with no slot at all can be carried
    expect(canEquipTo({ equipSlot: undefined }, "backpack")).toBe(true);
  });

  it("refuses to wear an item that declares no slot", () => {
    expect(canEquipTo({ equipSlot: undefined }, "body")).toBe(false);
  });
});

describe("slotsConsumedBy", () => {
  it("takes both hands for a two-handed weapon", () => {
    const longbow = equipment("item_weapon_longbow");

    expect(slotsConsumedBy(longbow, "main_hand")).toEqual([
      "main_hand",
      "off_hand",
    ]);
  });

  it("takes one hand for a one-handed weapon", () => {
    expect(slotsConsumedBy(equipment("item_weapon_dagger"), "main_hand")).toEqual(
      ["main_hand"],
    );
  });

  it("consumes nothing when the item is only carried", () => {
    expect(slotsConsumedBy(equipment("item_weapon_longbow"), "backpack")).toEqual(
      [],
    );
  });
});

describe("firstFreeSlot", () => {
  it("fills the lower ring finger first", () => {
    expect(firstFreeSlot("ring", [])).toBe("ring_1");
    expect(firstFreeSlot("ring", ["ring_1"])).toBe("ring_2");
  });

  it("reports no free slot once both fingers are taken", () => {
    const occupied: CharacterSlot[] = ["ring_1", "ring_2"];
    expect(firstFreeSlot("ring", occupied)).toBeUndefined();
  });
});
