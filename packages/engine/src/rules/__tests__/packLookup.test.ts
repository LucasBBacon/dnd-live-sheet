import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleCoreRulePackSync } from "@project/database/pack";
import { packToRuleLookup } from "../packLookup.js";
import { corePack } from "../../pipeline/__tests__/corePackFixture.js";

const PACK_ROOT = path.join(
  process.cwd(),
  "../database/data/packs/core_2014_pack",
);

/**
 * The projection #37 records as being rebuilt by hand in three places. Two of
 * them - the engine fixture and the web fixture - were byte-for-byte the same
 * idea written twice, and this is the one implementation they now share.
 *
 * The third, `ruleSnapshotCache`, is deliberately *not* folded in: it builds
 * equipment from the relational `items` table through `projectEquipmentRows`,
 * not from `pack.equipment`, so it is a different projection of a different
 * source that happens to produce the same shape. See #37 in the backlog.
 */
describe("packToRuleLookup", () => {
  const pack = assembleCoreRulePackSync(PACK_ROOT);
  const lookup = packToRuleLookup(pack);

  it("keys every piece of the pack's equipment by id", () => {
    expect(Object.keys(lookup.equipmentById)).toHaveLength(
      pack.equipment.length,
    );
    expect(lookup.equipmentById["item_weapon_longsword"]?.name).toBe(
      "Longsword",
    );
  });

  it("keys only weapon-capable equipment into the weapon view", () => {
    // The bug this catches is the easy one to write: projecting every item as
    // a weapon, which would make plate armour swingable.
    expect(lookup.weaponsById["item_weapon_longsword"]).toBeDefined();
    expect(lookup.weaponsById["item_armor_plate"]).toBeUndefined();
    expect(Object.keys(lookup.weaponsById).length).toBeLessThan(
      Object.keys(lookup.equipmentById).length,
    );
  });

  it("keys the pack's resources by id", () => {
    // resourcesById now also carries every trait's own pools (see the
    // resourcesById describe block below), so this only checks that the
    // pack-level section itself is present and correctly keyed.
    for (const resource of pack.resources) {
      expect(lookup.resourcesById[resource.id]).toEqual(resource);
    }
  });

  it("carries the rulebook maps the snapshot resolves by id", () => {
    // Dropping any one of these leaves a lookup that resolves nothing for a
    // whole section while still looking populated.
    expect(Object.keys(lookup.traitsById ?? {})).toHaveLength(
      pack.traits.length,
    );
    expect(Object.keys(lookup.racesById ?? {})).toHaveLength(pack.races.length);
    expect(Object.keys(lookup.classesById ?? {})).toHaveLength(
      pack.classes.length,
    );
    expect(Object.keys(lookup.subclassesById ?? {})).toHaveLength(
      pack.subclasses.length,
    );
  });
});

describe("packToRuleLookup.resourcesById", () => {
  it("carries the pack-level resources", () => {
    const lookup = packToRuleLookup(corePack());

    expect(lookup.resourcesById["trait_action_surge"]?.name).toBe("Action Surge");
  });

  it("carries the resources traits grant, which the old projection dropped", () => {
    // Rage's pool lives on trait_rage, not in pack.resources. Without it in
    // the map, applyRest found no rule and never reset it.
    const rage = packToRuleLookup(corePack()).resourcesById["resource_barbarian_rage"];

    expect(rage?.resetCondition).toBe("long_rest");
  });
});
