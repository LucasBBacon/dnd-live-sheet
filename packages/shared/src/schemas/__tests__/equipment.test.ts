import { describe, expect, it } from "vitest";
import {
  EquipmentDefinitionSchema,
  WeaponCapabilitySchema,
} from "../content/equipment.js";
import { StartingEquipmentDefinitionSchema } from "../content/items.js";

describe("WeaponCapabilitySchema", () => {
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
});

describe("EquipmentDefinitionSchema is the single authored item shape", () => {
  it("carries everything ItemDefinition and WeaponDefinition did", () => {
    const parsed = EquipmentDefinitionSchema.parse({
      id: "item_longsword",
      name: "Longsword",
      type: "weapon",
      weight: 3,
      equipSlot: "main_hand",
      weapon: {
        category: "martial_melee",
        damageDice: "1d8",
        versatileDamageDice: "1d10",
        damageType: "slashing",
        properties: ["versatile"],
      },
    });
    expect(parsed.weapon?.versatileDamageDice).toBe("1d10");
    expect(parsed.equipSlot).toBe("main_hand");
  });

  it("no longer exports a second authored item shape", async () => {
    // a regression guard: reintroducing either schema re-opens the drift this
    // task closes, and nothing else would fail if one came back
    const items = await import("../content/items.js");
    const weapons = await import("../content/weapons.js");
    expect("ItemDefinitionSchema" in items).toBe(false);
    expect("WeaponDefinitionSchema" in weapons).toBe(false);
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

describe("a container carries its capacity on EquipmentDefinition", () => {
  it("round-trips a pounds-of-gear capacity", () => {
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_backpack",
      name: "Backpack",
      type: "gear",
      weight: 5,
      container: { capacityPounds: 30 },
    });

    expect(equipment.container).toEqual({ capacityPounds: 30 });
  });

  it("leaves container absent on equipment that is not one", () => {
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_weapon_dagger",
      name: "Dagger",
      type: "weapon",
      weight: 1,
    });

    expect(equipment.container).toBeUndefined();
  });

  it("parses category tags on authored equipment", () => {
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_holy_symbol_amulet",
      name: "Holy Symbol (Amulet)",
      type: "gear",
      categoryTags: ["category_holy_symbol"],
    });

    expect(equipment.categoryTags).toEqual(["category_holy_symbol"]);
  });

  it("defaults missing category tags to an empty array", () => {
    const equipment = EquipmentDefinitionSchema.parse({
      id: "item_pack_explorers",
      name: "Explorer's Pack",
      type: "gear",
    });

    expect(equipment.categoryTags).toEqual([]);
  });
});

describe("WeaponCapabilitySchema damage is optional but never half-authored", () => {
  // These refines are invisible to packSchemas.test.ts: z.toJSONSchema drops
  // .refine() silently, so Zod is the only layer that enforces them and this
  // is the only place they are covered.

  it("accepts a weapon with no damage at all", () => {
    const parsed = WeaponCapabilitySchema.parse({
      category: "martial_ranged",
      properties: ["special", "thrown"],
      range: 5,
      longRange: 15,
      specialNote: "Target is restrained (Large or smaller).",
    });

    expect(parsed.damageDice).toBeUndefined();
    expect(parsed.damageType).toBeUndefined();
  });

  it("accepts flat damage", () => {
    const parsed = WeaponCapabilitySchema.parse({
      category: "simple_ranged",
      damageDice: "1",
      damageType: "piercing",
      properties: ["ammunition", "loading"],
      range: 25,
      longRange: 100,
    });

    expect(parsed.damageDice).toBe("1");
  });

  it("rejects a damage die with no damage type", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "simple_melee",
      damageDice: "1d4",
      properties: [],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a damage type with no damage die", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "simple_melee",
      damageType: "bludgeoning",
      properties: [],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects the empty-string damage the net used to carry", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_ranged",
      damageDice: "",
      damageType: "",
      properties: ["special", "thrown"],
      range: 5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a versatile die with no one-handed die to upgrade from", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      versatileDamageDice: "1d10",
      properties: ["versatile"],
      range: 5,
    });

    expect(result.success).toBe(false);
  });
});

describe("a special weapon must say what is special about it", () => {
  // Zod-only, like the other two refines: invisible to the ajv pass.
  it("rejects the special property with no specialNote", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      damageDice: "1d12",
      damageType: "piercing",
      properties: ["reach", "special"],
      range: 10,
    });

    expect(result.success).toBe(false);
  });

  it("accepts the special property when a note is authored", () => {
    const result = WeaponCapabilitySchema.safeParse({
      category: "martial_melee",
      damageDice: "1d12",
      damageType: "piercing",
      properties: ["reach", "special"],
      range: 10,
      specialNote:
        "Disadvantage on attacks against targets within 5 feet. Requires two hands to attack while not mounted.",
    });

    expect(result.success).toBe(true);
  });
});
