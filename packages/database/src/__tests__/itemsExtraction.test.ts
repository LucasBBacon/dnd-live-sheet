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
    expect(result.seedItems[0].name).toBe("Crossbow Bolt");
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
    expect(result.itemRulesById.item_armor_plate.weight).toBe(65);
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

    expect(result.itemRulesById.item_ammo_arrow.weight).toBe(0.05);
    expect(result.seedItems[0].weight).toBe(5);
  });

  it("defaults a weightless source item to zero", () => {
    const result = extractItemsForMigration([
      { id: "item_note", name: "Scrap of Paper", type: "gear" },
    ]);

    expect(result.itemRulesById.item_note.weight).toBe(0);
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
});
