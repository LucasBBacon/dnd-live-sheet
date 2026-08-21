import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "@project/database/src/corePackAssembler.js";
import { projectCoreRulePack } from "@project/database/src/corePackProjection.js";
import {
  projectEquipmentRows,
  type EquipmentRuleRow,
} from "../ruleSnapshotProjection.js";

/**
 * The real catalogue, not a fixture.
 *
 * Every other test on this seam stops at a hand-written literal, which is how
 * a missing versatileDamageDice survived three reviews: when the fixture is
 * wrong, the input and the expectation are wrong together and the test passes
 * anyway. Reading the shipped pack is the only thing that catches that.
 *
 * The catalogue now travels pack -> importer projection -> items columns ->
 * snapshot, rather than items.json -> seed -> columns -> snapshot. Same seam,
 * one source.
 */
const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let itemRows: EquipmentRuleRow[];

beforeAll(async () => {
  const pack = await assembleCoreRulePack(PACK_DIR);
  // the columns the importer writes, in the shape the cache selects them back
  // out. mapping here rather than mocking Drizzle keeps the test pure while
  // still crossing the boundary that actually loses fields
  itemRows = projectCoreRulePack(pack).items.map((item) => ({
    id: item.id,
    name: item.name,
    weight: item.weight,
    itemRule: item.itemRule,
    weaponRule: item.weaponRule ?? null,
  }));
});

const project = () => ({
  projection: projectEquipmentRows(itemRows),
});

describe("the importer and the rule snapshot projection agree", () => {
  it("carries every catalogue item through without a malformed row", () => {
    const { projection } = project();

    expect(projection.malformedItemIds).toEqual([]);
    expect(Object.keys(projection.equipmentById)).toHaveLength(itemRows.length);
    // the pack carries every id exactly once; items.json's duplicate
    // item_ammo_bolt could not survive the pack's duplicate_id validation
    expect(itemRows.length).toBeGreaterThan(100);
  });

  it("keeps armour weight and its AC modifier across the whole path", () => {
    const plate = project().projection.equipmentById.item_armor_plate!;

    expect(plate.weight).toBe(65);
    // objectContaining rather than an exact literal: the pack's plate also
    // carries maxDexCap, which items.json never did. the point of the
    // assertion is that the AC rule survives the whole path, not that the
    // modifier has exactly the fields the old catalogue happened to author
    expect(plate.modifiers).toContainEqual(
      expect.objectContaining({
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 18,
      }),
    );
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

  // The container weights used to be authored twice - once in items.json,
  // which the database seeded, and once in EQUIPMENT_DICTIONARY, which the
  // engine read - and a test here was the only thing keeping the two in
  // agreement. Both sources are gone: the pack is the single source, the
  // database is projected from it, and the drift this guarded against can no
  // longer happen.
});
