import { describe, expect, it } from "vitest";
import { WeaponCapabilitySchema } from "../equipment.js";
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
