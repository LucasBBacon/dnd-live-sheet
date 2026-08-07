import { describe, expect, it } from "vitest";
import { EquipmentDefinitionSchema, WeaponCapabilitySchema } from "../equipment.js";
import { ItemDefinitionSchema } from "../items.js";
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
      ammoItemId: "item_ammo_arrow",
      ammoTag: "arrow",
    });

    const { id, name, ...capability } = definition;

    // the capability schema is strict, so an unrecognised key throws here
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
    });

    expect(parsed.versatileDamageDice).toBe("1d10");
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
    // both schemas are strict, so an unrecognised `container` key throws here
    // rather than being quietly dropped - which is the failure mode this
    // whole complementary-schema pairing exists to prevent
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
