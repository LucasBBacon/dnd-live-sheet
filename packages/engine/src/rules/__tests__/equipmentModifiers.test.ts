import { describe, expect, it } from "vitest";
import { EQUIPMENT_RULES_MAP } from "../equipmentModifiers";

describe("EQUIPMENT_RULES_MAP", () => {
  it("contains expected rule keys", () => {
    expect(Object.keys(EQUIPMENT_RULES_MAP).sort()).toEqual([
      "item_armor_leather",
      "item_armor_plate",
      "item_ring_of_protection",
      "item_shield",
    ]);
  });

  it("generates leather armor base AC rule", () => {
    const mods = EQUIPMENT_RULES_MAP.item_armor_leather("inst_leather");
    expect(mods).toEqual([
      {
        id: "inst_leather_ac",
        target: "AC",
        type: "set_base",
        value: 11,
        sourceName: "Leather Armor",
        sourceOrigin: "Item",
        isActive: true,
      },
    ]);
  });

  it("generates plate armor AC and stealth disadvantage rules", () => {
    const mods = EQUIPMENT_RULES_MAP.item_armor_plate("inst_plate");
    expect(mods).toEqual([
      {
        id: "inst_plate_ac",
        target: "AC",
        type: "set_base",
        value: 18,
        sourceName: "Plate Armor",
        sourceOrigin: "Item",
        isActive: true,
      },
      {
        id: "inst_plate_stealth_dis",
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        sourceName: "Plate Armor (Heavy)",
        sourceOrigin: "Item",
        isActive: true,
      },
    ]);
  });

  it("generates shield AC bonus rule", () => {
    const mods = EQUIPMENT_RULES_MAP.item_shield("inst_shield");
    expect(mods).toEqual([
      {
        id: "inst_shield_shield_ac",
        target: "AC",
        type: "add",
        value: 2,
        sourceName: "Shield",
        sourceOrigin: "Item",
        isActive: true,
      },
    ]);
  });

  it("generates ring of protection AC and saves bonus rules", () => {
    const mods = EQUIPMENT_RULES_MAP.item_ring_of_protection("inst_ring");
    expect(mods).toEqual([
      {
        id: "inst_ring_rop_ac",
        target: "AC",
        type: "add",
        value: 1,
        sourceName: "Ring of Protection",
        sourceOrigin: "Item",
        isActive: true,
      },
      {
        id: "inst_ring_rop_saves",
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        sourceName: "Ring of Protection",
        sourceOrigin: "Item",
        isActive: true,
      },
    ]);
  });

  it("creates unique modifier ids per instance id", () => {
    const leatherA = EQUIPMENT_RULES_MAP.item_armor_leather("a_1")[0].id;
    const leatherB = EQUIPMENT_RULES_MAP.item_armor_leather("b_2")[0].id;
    expect(leatherA).toBe("a_1_ac");
    expect(leatherB).toBe("b_2_ac");
    expect(leatherA).not.toBe(leatherB);
  });
});
