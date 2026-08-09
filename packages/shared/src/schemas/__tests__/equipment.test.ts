import { describe, expect, it } from "vitest";
import {
  EquipmentDefinitionSchema,
  WeaponCapabilitySchema,
} from "../equipment.js";
import {
  ItemDefinitionSchema,
  StartingEquipmentDefinitionSchema,
} from "../items.js";
import { WeaponDefinitionSchema } from "../weapons.js";

/**
 * EquipmentDefinition carries a weapon as a WeaponCapability, and the engine
 * projects that back out as a WeaponDefinition by adding id and name. If the
 * two shapes ever stop being exact complements, that projection silently
 * loses whichever field drifted - which is how versatileDamageDice went
 * missing from every snapshot-resolved weapon.
 */
describe("WeaponCapability and WeaponDefinition stay complementary", () => {
  it("covers every WeaponDefinition field except id and name", () => {
    const definitionKeys = Object.keys(WeaponDefinitionSchema.shape).sort();
    const capabilityKeys = Object.keys(WeaponCapabilitySchema.shape).sort();

    expect([...capabilityKeys, "id", "name"].sort()).toEqual(definitionKeys);
  });

  it("round-trips a fully-populated weapon through the capability shape", () => {
    const definition = WeaponDefinitionSchema.parse({
      id: "item_weapon_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
      range: 5,
      longRange: 10,
      ammoItemId: "item_ammo_arrow",
      ammoTag: "arrow",
    });

    const { id, name, ...capability } = definition;

    // the capability schema is strict, so an unrecognized key throws here
    // rather than being quietly dropped
    const parsed = WeaponCapabilitySchema.parse(capability);

    expect({ id, name, ...parsed }).toEqual(definition);
  });

  it("keeps the versatile damage die a versatile weapon depends on", () => {
    // combat.ts and weaponSynthesizer.ts both branch on this to pick the
    // two-handed damage die, so losing it silently downgrades a longsword
    const parsed = WeaponCapabilitySchema.parse({
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
      range: 5,
      longRange: 10,
    });

    expect(parsed.versatileDamageDice).toBe("1d10");
  });

  it("preserves authored weapon range and long-range values", () => {
    const parsed = WeaponCapabilitySchema.parse({
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition"],
      range: 150,
      longRange: 600,
    });

    expect(parsed.range).toBe(150);
    expect(parsed.longRange).toBe(600);
  });

  it("keeps the weapon definition shape aligned with the authored capability schema", () => {
    const parsed = WeaponDefinitionSchema.parse({
      id: "item_weapon_longbow",
      name: "Longbow",
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition"],
      range: 150,
      longRange: 600,
    });

    expect(parsed.range).toBe(150);
    expect(parsed.longRange).toBe(600);
  });
});

describe("StartingEquipmentDefinitionSchema", () => {
  it("parses the authored bundles used by classes and backgrounds", () => {
    const parsed = StartingEquipmentDefinitionSchema.parse({
      given: [{ kind: "item", refId: "item_pack_explorers", quantity: 1 }],
      choices: [
        {
          choose: 1,
          options: [
            {
              equipmentBundle: [
                { kind: "item", refId: "item_weapon_dagger", quantity: 1 },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed.given).toEqual([
      { kind: "item", refId: "item_pack_explorers", quantity: 1 },
    ]);
    expect(parsed.choices[0]?.options[0]?.equipmentBundle).toEqual([
      { kind: "item", refId: "item_weapon_dagger", quantity: 1 },
    ]);
  });

  it("defaults missing sections to empty arrays", () => {
    const parsed = StartingEquipmentDefinitionSchema.parse({});

    expect(parsed.given).toEqual([]);
    expect(parsed.choices).toEqual([]);
  });
});

describe("ItemDefinition and EquipmentDefinition stay complementary", () => {
  it("covers every ItemDefinition field, plus weapon", () => {
    // EquipmentDefinition is the authored source ItemDefinition is projected
    // from, so it must be a strict superset by exactly one field. drift here
    // means the snapshot projection starts rejecting rows wholesale, because
    // EquipmentDefinitionSchema is strict
    const itemKeys = Object.keys(ItemDefinitionSchema.shape).sort();
    const equipmentKeys = Object.keys(EquipmentDefinitionSchema.shape).sort();

    expect([...itemKeys, "weapon"].sort()).toEqual(equipmentKeys);
  });
});

describe("a container carries its capacity through both shapes", () => {
  it("round-trips a pounds-of-gear capacity", () => {
    // if `container` were ever dropped from one of these schemas, the two
    // parses below would not fail the same way. EquipmentDefinitionSchema is
    // strict, so it would throw on the now-unrecognized key. ItemDefinitionSchema
    // is not strict, so it would silently strip the key instead - only the
    // toEqual assertions below would catch that, by finding container missing
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      container: { capacityPounds: 30 },
    });

    expect(equipment.container).toEqual({ capacityPounds: 30 });

    const item = ItemDefinitionSchema.parse({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      container: { capacityPounds: 30 },
    });

    expect(item.container).toEqual({ capacityPounds: 30 });
  });

  it("leaves container absent on an item that is not one", () => {
    const item = ItemDefinitionSchema.parse({
      id: "item_weapon_dagger",
      name: "Dagger",
      type: "weapon",
      weight: 1,
    });

    expect(item.container).toBeUndefined();
  });
});
