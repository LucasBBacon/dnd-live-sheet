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
      type: "armor",
      modifiers: [
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
