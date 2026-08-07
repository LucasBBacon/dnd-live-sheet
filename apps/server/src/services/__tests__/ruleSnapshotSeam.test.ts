import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extractItemsForMigration } from "@project/database/src/itemsExtraction.js";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

const resolve = createRequire(import.meta.url).resolve;

/**
 * The real catalogue, not a fixture.
 *
 * Every other test on this seam stops at a hand-written literal, which is how
 * a missing versatileDamageDice survived three reviews: when the fixture is
 * wrong, the input and the expectation are wrong together and the test passes
 * anyway. Reading the shipped file is the only thing that catches that.
 */
const rawItems = JSON.parse(
  readFileSync(resolve("@project/database/data/items.json"), "utf-8"),
) as unknown[];

/**
 * The columns the seed writes, in the shape the cache selects them back out.
 * Mapping here rather than mocking Drizzle keeps the test pure while still
 * crossing the boundary that actually loses fields.
 */
const toRuleRows = (
  seedItems: ReturnType<typeof extractItemsForMigration>["seedItems"],
): EquipmentRuleRow[] =>
  seedItems.map((item) => ({
    id: item.id,
    name: item.name,
    weight: item.weight,
    itemRule: item.itemRule,
    weaponRule: item.weaponRule ?? null,
  }));

const project = () => {
  const extracted = extractItemsForMigration(rawItems);

  return {
    extracted,
    projection: projectEquipmentRows(toRuleRows(extracted.seedItems)),
  };
};

describe("the extractor and the rule snapshot projection agree", () => {
  it("carries every catalogue item through without a malformed row", () => {
    const { extracted, projection } = project();

    expect(projection.malformedItemIds).toEqual([]);
    expect(Object.keys(projection.equipmentById)).toHaveLength(
      extracted.seedItems.length,
    );
    // 92 unique ids across 93 entries: items.json has a known duplicate
    // item_ammo_bolt, which the extractor drops and reports
    expect(extracted.seedItems).toHaveLength(92);
  });

  it("keeps armour weight and its AC modifier across the whole path", () => {
    const plate = project().projection.equipmentById.item_armor_plate!;

    expect(plate.weight).toBe(65);
    expect(plate.modifiers).toContainEqual({
      target: "ARMOR_CLASS",
      type: "set_base",
      value: 18,
      scalingFactor: "none",
      requiredStates: [],
      forbiddenStates: [],
    });
  });

  it("keeps a versatile weapon's two-handed die", () => {
    // the exact field that went missing, asserted on real data this time
    const longsword = project().projection.weaponsById.item_weapon_longsword!;

    expect(longsword.versatileDamageDice).toBe("1d10");
    expect(longsword.damageDice).toBe("1d8");
  });

  it("keeps a fractional weight exact through the hundredths round trip", () => {
    // 0.05 lb -> 5 hundredths in the column -> 0.05 lb back out
    expect(project().projection.equipmentById.item_ammo_arrow!.weight).toBe(
      0.05,
    );
  });
});
