import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractItemsForMigration } from "../itemsExtraction.js";

describe("extractItemsForMigration", () => {
  it("keeps first duplicate item id deterministically", () => {
    const result = extractItemsForMigration([
      {
        id: "item_ammo_bolt",
        name: "Crossbow Bolt",
        type: "gear",
      },
      {
        id: "item_ammo_bolt",
        name: "Sling Bolt",
        type: "gear",
      },
    ]);

    expect(result.seedItems).toHaveLength(1);
    expect(result.seedItems[0]?.name).toBe("Crossbow Bolt");
    expect(result.diagnostics.duplicateIds).toEqual([
      {
        id: "item_ammo_bolt",
        firstIndex: 0,
        duplicateIndex: 1,
      },
    ]);
  });

  it("emits missing ammo diagnostics when a weapon references missing ammo", () => {
    const result = extractItemsForMigration([
      {
        id: "item_weapon_test",
        name: "Test Weapon",
        type: "weapon",
        weaponProperties: {
          category: "simple_ranged",
          damageDice: "1d4",
          damageType: "piercing",
          propertyIds: ["property_ammunition"],
          ammoItemId: "item_missing_ammo",
        },
      },
    ]);

    expect(result.weaponRulesById.item_weapon_test).toBeDefined();
    expect(result.diagnostics.missingAmmoItemRefs).toEqual([
      {
        weaponId: "item_weapon_test",
        ammoItemId: "item_missing_ammo",
      },
    ]);
  });

  it("returns extraction payload without legacy alias tables", () => {
    const result = extractItemsForMigration([]);

    expect(result.seedItems).toEqual([]);
    expect(result.bundleContents).toEqual([]);
    expect(result.diagnostics.duplicateIds).toEqual([]);
  });

  it("adds manual ring of protection rule override", () => {
    const result = extractItemsForMigration([]);

    expect(result.itemRulesById.item_ring_of_protection).toEqual({
      id: "item_ring_of_protection",
      name: "Ring of Protection",
      // worn, but not armor: slot legality comes from equipSlot
      type: "wondrous",
      weight: 0,
      equipSlot: "ring",
      requiresAttunement: true,
      categoryTags: [],
      modifiers: [
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
      ],
    });
  });

  it("maps loading and special weapon rule flags into weapon properties", () => {
    const result = extractItemsForMigration([
      {
        id: "item_weapon_flagged",
        name: "Flagged Weapon",
        type: "weapon",
        weaponProperties: {
          category: "simple_ranged",
          damageDice: "1d6",
          damageType: "piercing",
          propertyIds: [],
          rules: {
            loading: true,
            special: true,
          },
        },
      },
    ]);

    expect(result.weaponRulesById.item_weapon_flagged?.properties).toEqual(
      expect.arrayContaining(["loading", "special"]),
    );
  });

  it("carries item weight into the rule payload", () => {
    const result = extractItemsForMigration([
      {
        id: "item_armor_plate",
        name: "Plate Armor",
        type: "armor",
        weight: 65,
      },
    ]);

    // the rule payload is what the engine reads; it was being dropped, so
    // every snapshot-resolved item weighed nothing
    expect(result.itemRulesById.item_armor_plate?.weight).toBe(65);
  });

  it("keeps the rule payload in pounds while the column stores hundredths", () => {
    const result = extractItemsForMigration([
      {
        id: "item_ammo_arrow",
        name: "Arrow",
        type: "gear",
        weight: 0.05,
      },
    ]);

    expect(result.itemRulesById.item_ammo_arrow?.weight).toBe(0.05);
    expect(result.seedItems[0]?.weight).toBe(5);
  });

  it("defaults a weightless source item to zero", () => {
    const result = extractItemsForMigration([
      { id: "item_note", name: "Scrap of Paper", type: "gear" },
    ]);

    expect(result.itemRulesById.item_note?.weight).toBe(0);
  });

  it("floors a negative source weight in the payload, not just the column", () => {
    const result = extractItemsForMigration([
      { id: "item_bad_data", name: "Impossible Feather", type: "gear", weight: -5 },
    ]);

    // the column has always clamped. the payload is what the engine reads, and
    // it did not - so a bad row could make a character's pack weigh less
    expect(result.itemRulesById.item_bad_data?.weight).toBe(0);
    expect(result.seedItems[0]?.weight).toBe(0);
  });

  it("carries versatile damage dice into the weapon rule", () => {
    const result = extractItemsForMigration([
      {
        id: "item_weapon_longsword",
        name: "Longsword",
        type: "weapon",
        weight: 3,
        weaponProperties: {
          category: "martial_melee",
          damageDice: "1d8",
          versatileDamageDice: "1d10",
          damageType: "slashing",
          propertyIds: ["property_versatile"],
        },
      },
    ]);

    // the source data carries this for six weapons; without it a versatile
    // weapon silently deals its one-handed die in both hands
    expect(result.weaponRulesById.item_weapon_longsword?.versatileDamageDice).toBe(
      "1d10",
    );
  });

  it("parses real items.json and reports known duplicate ammo id", () => {
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const rawItems = JSON.parse(readFileSync(itemsPath, "utf-8"));

    const result = extractItemsForMigration(rawItems);
    const duplicateIds = result.diagnostics.duplicateIds.map((d) => d.id);

    expect(result.seedItems.length).toBeGreaterThan(0);
    expect(result.weaponRulesById.item_weapon_longbow?.ammoItemId).toBe(
      "item_ammo_arrow",
    );
    expect(duplicateIds).toContain("item_ammo_bolt");
  });

  it("carries every pack line item in the catalogue at its PHB weight", () => {
    // the equipment packs cannot become bundles until their contents exist as
    // items, and a wrong weight here silently changes what a character carries
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const expected: Record<string, number> = {
      item_bedroll: 7,
      item_mess_kit: 1,
      item_tinderbox: 1,
      item_rations: 2,
      item_waterskin: 5,
      item_rope_hempen: 10,
      item_chest: 25,
      item_case_map_or_scroll: 1,
      item_clothes_fine: 6,
      item_ink: 0,
      item_ink_pen: 0,
      item_lamp: 1,
      item_oil_flask: 1,
      item_paper: 0,
      item_perfume: 0,
      item_sealing_wax: 0,
      item_soap: 0,
      item_blanket: 3,
      item_candle: 0,
      item_alms_box: 1,
      item_incense: 0,
      item_censer: 1,
      item_vestments: 4,
      item_clothes_costume: 4,
      item_disguise_kit: 3,
      item_sack: 0.5,
      item_pouch: 1,
      item_basket: 2,
    };

    for (const [id, weight] of Object.entries(expected)) {
      expect(result.itemRulesById[id]?.weight, id).toBe(weight);
    }
  });

  it("gives each equipment pack contents that weigh what the pack weighs", () => {
    // the guard that actually catches a mistyped id or a wrong quantity: a
    // pack is a bundle, so its aggregate weight has to be exactly what its
    // contents come to, or expanding it at acquisition changes the load
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const packs = [
      "item_pack_explorers",
      "item_pack_diplomats",
      "item_pack_priests",
      "item_pack_entertainers",
    ];

    for (const packId of packs) {
      const contents = result.bundleContents.filter((c) => c.bundleId === packId);

      expect(contents.length, packId).toBeGreaterThan(0);

      // summed in hundredths for the same reason weight always is: 0.05 lb
      // line items make a float sum disagree with itself
      const contentsHundredths = contents.reduce((total, entry) => {
        const rule = result.itemRulesById[entry.itemId];
        expect(rule, `${packId} -> ${entry.itemId}`).toBeDefined();
        return total + Math.round(rule!.weight * 100) * entry.quantity;
      }, 0);

      expect(contentsHundredths, packId).toBe(
        result.itemRulesById[packId]!.weight * 100,
      );
    }
  });

  it("marks the equipment packs as bundles", () => {
    const itemsPath = path.resolve(__dirname, "../../data/items.json");
    const result = extractItemsForMigration(
      JSON.parse(readFileSync(itemsPath, "utf-8")),
    );

    const explorers = result.seedItems.find(
      (item) => item.id === "item_pack_explorers",
    );

    expect(explorers?.isBundle).toBe(true);
  });
});
