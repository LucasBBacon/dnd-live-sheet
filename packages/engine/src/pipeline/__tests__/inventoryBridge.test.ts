import { describe, expect, it } from "vitest";
import { InventoryBridge } from "../inventoryBridge";

describe("InventoryBridge.compileEquipmentModifiers", () => {
  it("returns an empty array for empty input", () => {
    expect(InventoryBridge.compileEquipmentModifiers([])).toEqual([]);
  });

  it("ignores backpack items and unknown item ids", () => {
    const result = InventoryBridge.compileEquipmentModifiers([
      {
        id: "inst_1",
        itemId: "item_shield",
        slot: "backpack",
        isAttuned: false,
      },
      {
        id: "inst_2",
        itemId: "item_unknown",
        slot: "main_hand",
        isAttuned: false,
      },
    ]);

    expect(result).toEqual([]);
  });

  it("compiles modifiers for equipped known items", () => {
    const result = InventoryBridge.compileEquipmentModifiers([
      {
        id: "shield_1",
        itemId: "item_shield",
        slot: "off_hand",
        isAttuned: false,
      },
      {
        id: "ring_1",
        itemId: "item_ring_of_protection",
        slot: "ring_1",
        isAttuned: true,
      },
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "shield_1_shield_ac",
          target: "AC",
          type: "add",
          value: 2,
          isActive: true,
        }),
        expect.objectContaining({
          id: "ring_1_rop_ac",
          target: "AC",
          value: 1,
          isActive: true,
        }),
        expect.objectContaining({
          id: "ring_1_rop_saves",
          target: "ALL_SAVES",
          value: 1,
          isActive: true,
        }),
      ]),
    );
  });

  it("deactivates modifiers when attunement is required but item is not attuned", () => {
    const result = InventoryBridge.compileEquipmentModifiers([
      {
        id: "ring_2",
        itemId: "item_ring_of_protection",
        slot: "ring_2",
        isAttuned: false,
        requiresAttunement: true,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((mod) => mod.isActive === false)).toBe(true);
  });

  it("keeps modifiers active when attunement is required and satisfied", () => {
    const result = InventoryBridge.compileEquipmentModifiers([
      {
        id: "ring_3",
        itemId: "item_ring_of_protection",
        slot: "ring_1",
        isAttuned: true,
        requiresAttunement: true,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((mod) => mod.isActive)).toBe(true);
  });

  it("preserves default rule activity when requiresAttunement is omitted", () => {
    const result = InventoryBridge.compileEquipmentModifiers([
      {
        id: "plate_1",
        itemId: "item_armor_plate",
        slot: "armor",
        isAttuned: false,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((mod) => mod.isActive)).toBe(true);
  });
});
