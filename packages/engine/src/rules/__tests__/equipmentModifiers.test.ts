import { describe, expect, it } from "vitest";
import type { ItemDefinition } from "@project/shared";
import { ITEM_DICTIONARY } from "../itemDictionary.js";

/** Asserts the entry exists, so each assertion reads against a real item. */
const entry = (id: string): ItemDefinition => {
  const item = ITEM_DICTIONARY[id];
  if (!item) throw new Error(`ITEM_DICTIONARY is missing ${id}`);
  return item;
};

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
    expect(entry("item_armor_leather").modifiers).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ]);
  });

  it("defines plate armor AC and stealth disadvantage rules", () => {
    expect(entry("item_armor_plate").modifiers).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 18,
        scalingFactor: "none",
        // heavy armor: the wearer adds no Dex to AC
        maxDexCap: 0,
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ]);
  });

  it("leaves light armor uncapped so it keeps the full Dex modifier", () => {
    for (const id of [
      "item_armor_padded",
      "item_armor_leather",
      "item_armor_studded_leather",
    ]) {
      const baseSetter = entry(id).modifiers?.find(
        (mod) => mod.type === "set_base",
      );
      expect(baseSetter?.maxDexCap, `${id} dex cap`).toBeUndefined();
    }
  });

  it("defines shield AC bonus rule", () => {
    expect(entry("item_armor_shield").modifiers).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 2,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ]);
  });

  it("defines ring of protection AC and saves bonus rules", () => {
    expect(entry("item_ring_of_protection").modifiers).toEqual([
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ]);
  });

  it("includes required item metadata", () => {
    expect(entry("item_armor_leather").id).toBe("item_armor_leather");
    expect(entry("item_armor_leather").name).toBe("Leather Armor");
    expect(entry("item_armor_leather").type).toBe("armor");
  });

  it("projects the inventory metadata every entry now carries", () => {
    for (const [id, item] of Object.entries(ITEM_DICTIONARY)) {
      expect(item.weight, `${id} weight`).toBeTypeOf("number");
      expect(item.requiresAttunement, `${id} attunement`).toBeTypeOf("boolean");
      // every authored entry is wearable or wieldable, so all claim a slot
      expect(item.equipSlot, `${id} slot`).toBeDefined();
    }
  });

  it("marks the ring of protection as the one attunement item", () => {
    const attuned = Object.entries(ITEM_DICTIONARY)
      .filter(([, item]) => item.requiresAttunement)
      .map(([id]) => id);

    expect(attuned).toEqual(["item_ring_of_protection"]);
    expect(entry("item_ring_of_protection").equipSlot).toBe("ring");
  });

  it("gives body armor the body slot and a shield the off hand", () => {
    expect(entry("item_armor_plate").equipSlot).toBe("body");
    expect(entry("item_armor_plate").weight).toBe(65);
    expect(entry("item_armor_shield").equipSlot).toBe("off_hand");
  });

  it("projects weapon items as type weapon", () => {
    expect(entry("item_weapon_longsword").id).toBe("item_weapon_longsword");
    expect(entry("item_weapon_longsword").name).toBe("Longsword");
    expect(entry("item_weapon_longsword").type).toBe("weapon");
    expect(entry("item_weapon_longsword").modifiers).toBeUndefined();
  });
});
