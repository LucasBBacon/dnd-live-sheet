import { describe, expect, it } from "vitest";
import { ITEM_DICTIONARY } from "../itemDictionary";

describe("ITEM_DICTIONARY", () => {
  it("contains expected armour and weapon keys", () => {
    const itemKeys = Object.keys(ITEM_DICTIONARY);

    expect(itemKeys).toEqual(
      expect.arrayContaining([
        "item_armor_leather",
        "item_armor_padded",
        "item_armor_plate",
        "item_armor_shield",
        "item_armor_studded_leather",
        "item_ring_of_protection",
        "item_weapon_longsword",
        "item_weapon_dagger",
        "item_weapon_longbow",
      ]),
    );
  });

  it("defines leather armor with base AC rule", () => {
    const mods = ITEM_DICTIONARY.item_armor_leather.modifiers;
    expect(mods).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11,
        scalingFactor: "none",
      },
    ]);
  });

  it("defines plate armor AC and stealth disadvantage rules", () => {
    const mods = ITEM_DICTIONARY.item_armor_plate.modifiers;
    expect(mods).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 18,
        scalingFactor: "none",
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
      },
    ]);
  });

  it("defines shield AC bonus rule", () => {
    const mods = ITEM_DICTIONARY.item_armor_shield.modifiers;
    expect(mods).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 2,
        scalingFactor: "none",
      },
    ]);
  });

  it("defines ring of protection AC and saves bonus rules", () => {
    const mods = ITEM_DICTIONARY.item_ring_of_protection.modifiers;
    expect(mods).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
      {
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
    ]);
  });

  it("includes required item metadata", () => {
    expect(ITEM_DICTIONARY.item_armor_leather.id).toBe("item_armor_leather");
    expect(ITEM_DICTIONARY.item_armor_leather.name).toBe("Leather Armor");
    expect(ITEM_DICTIONARY.item_armor_leather.type).toBe("armor");
  });

  it("projects weapon items as type weapon", () => {
    expect(ITEM_DICTIONARY.item_weapon_longsword.id).toBe(
      "item_weapon_longsword",
    );
    expect(ITEM_DICTIONARY.item_weapon_longsword.name).toBe("Longsword");
    expect(ITEM_DICTIONARY.item_weapon_longsword.type).toBe("weapon");
    expect(ITEM_DICTIONARY.item_weapon_longsword.modifiers).toBeUndefined();
  });
});
