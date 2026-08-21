import { describe, expect, it } from "vitest";
import type { ItemDefinition } from "@project/shared";
import { corePackEquipment } from "../../pipeline/__tests__/corePackFixture.js";

const { itemsById: ITEM_DICTIONARY, weaponsById: WEAPON_DICTIONARY } =
  corePackEquipment();

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
    }
  });

  it("gives every wearable entry a slot, and ammunition a tag instead", () => {
    for (const [id, item] of Object.entries(ITEM_DICTIONARY)) {
      if (item.type === "consumable") {
        // ammunition is spent from the pack, never worn
        expect(item.equipSlot, `${id} slot`).toBeUndefined();
        expect(item.ammoTag, `${id} tag`).toBeDefined();
        continue;
      }

      if (item.type === "gear") {
        // gear items like containers are carried but not worn
        expect(item.equipSlot, `${id} slot`).toBeUndefined();
        continue;
      }

      expect(item.equipSlot, `${id} slot`).toBeDefined();
    }
  });

  it("tags both arrow kinds so either can feed a longbow", () => {
    expect(entry("item_ammo_arrow").ammoTag).toBe("arrow");
    expect(entry("item_ammo_arrow_plus_one").ammoTag).toBe("arrow");
    expect(WEAPON_DICTIONARY.item_weapon_longbow?.ammoTag).toBe("arrow");
  });

  it("resolves the longbow's default ammunition to a real entry", () => {
    const defaultAmmo = WEAPON_DICTIONARY.item_weapon_longbow?.ammoItemId;

    expect(defaultAmmo).toBe("item_ammo_arrow");
    // the reference used to dangle: no arrow was authored anywhere
    expect(ITEM_DICTIONARY[defaultAmmo as string]).toBeDefined();
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
