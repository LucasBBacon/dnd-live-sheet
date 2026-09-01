import { describe, expect, it } from "vitest";
import type { EquipmentDefinition } from "@project/shared";
import { corePackEquipment } from "../../pipeline/__tests__/corePackFixture.js";

const { equipmentById: EQUIPMENT_DICTIONARY } = corePackEquipment();

/** Asserts the entry exists, so each assertion reads against a real item. */
const entry = (id: string): EquipmentDefinition => {
  const item = EQUIPMENT_DICTIONARY[id];
  if (!item) throw new Error(`EQUIPMENT_DICTIONARY is missing ${id}`);
  return item;
};

describe("EQUIPMENT_DICTIONARY", () => {
  it("contains expected armour and weapon keys", () => {
    const itemKeys = Object.keys(EQUIPMENT_DICTIONARY);

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
    for (const [id, item] of Object.entries(EQUIPMENT_DICTIONARY)) {
      expect(item.weight, `${id} weight`).toBeTypeOf("number");
      expect(item.requiresAttunement, `${id} attunement`).toBeTypeOf("boolean");
    }
  });

  it("gives every wearable entry a slot, and nothing carried one", () => {
    for (const [id, item] of Object.entries(EQUIPMENT_DICTIONARY)) {
      if (item.type === "consumable" || item.type === "gear") {
        // a consumable is drunk, thrown or spent and gear is carried; the two
        // differ over whether the sheet offers a "use" button, not over where
        // on the body they sit, because neither sits anywhere
        expect(item.equipSlot, `${id} slot`).toBeUndefined();
        continue;
      }

      expect(item.equipSlot, `${id} slot`).toBeDefined();
    }
  });

  it("gives every piece of ammunition the tag a weapon looks it up by", () => {
    // This used to be asserted of every consumable, which held only while the
    // two arrows were the only consumables the pack had. Once the gear table
    // arrived with acid, antitoxin, holy water, poison and a healing potion,
    // "consumable" plainly meant "spent when used" and not "ammunition" - and
    // ammunition is found by its tag anyway, which is the fact worth pinning.
    const ammunition = Object.entries(EQUIPMENT_DICTIONARY).filter(([id]) =>
      id.startsWith("item_ammo_"),
    );

    expect(ammunition.length).toBeGreaterThan(0);
    for (const [id, item] of ammunition) {
      expect(item.ammoTag, `${id} tag`).toBeDefined();
      expect(item.equipSlot, `${id} slot`).toBeUndefined();
    }
  });

  it("tags both arrow kinds so either can feed a longbow", () => {
    expect(entry("item_ammo_arrow").ammoTag).toBe("arrow");
    expect(entry("item_ammo_arrow_plus_one").ammoTag).toBe("arrow");
    expect(entry("item_weapon_longbow").weapon?.ammoTag).toBe("arrow");
  });

  it("resolves the longbow's default ammunition to a real entry", () => {
    const defaultAmmo = entry("item_weapon_longbow").weapon?.ammoItemId;

    expect(defaultAmmo).toBe("item_ammo_arrow");
    // the reference used to dangle: no arrow was authored anywhere
    expect(EQUIPMENT_DICTIONARY[defaultAmmo as string]).toBeDefined();
  });

  it("marks the ring of protection as the one attunement item", () => {
    const attuned = Object.entries(EQUIPMENT_DICTIONARY)
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
