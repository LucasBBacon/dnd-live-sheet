import { describe, expect, it } from "vitest";
import type { EquipmentDefinition } from "@project/shared";
import {
  armorProficiencyIds,
  isProficientWithWeapon,
  weaponProficiencyIds,
} from "../itemProficiency.js";

const armor = (
  overrides: Partial<EquipmentDefinition> = {},
): EquipmentDefinition =>
  ({
    id: "item_armor_plate",
    name: "Plate",
    type: "armor",
    weight: 65,
    armorCategory: "heavy",
    equipSlot: "body",
    requiresAttunement: false,
    categoryTags: [],
    ...overrides,
  }) as EquipmentDefinition;

describe("armorProficiencyIds", () => {
  it("names the item and its armour category", () => {
    expect(armorProficiencyIds(armor())).toEqual([
      "item_armor_plate",
      "category_armor_heavy",
    ]);
  });

  it("names a shield by its tag, which carries no armour category", () => {
    expect(
      armorProficiencyIds(
        armor({
          id: "item_armor_shield",
          name: "Shield",
          armorCategory: undefined,
          categoryTags: ["category_armor_shield"],
        }),
      ),
    ).toEqual(["item_armor_shield", "category_armor_shield"]);
  });

  it("ignores tags from other families", () => {
    expect(
      armorProficiencyIds(
        armor({ categoryTags: ["category_pack", "category_armor_shield"] }),
      ),
    ).toEqual([
      "item_armor_plate",
      "category_armor_heavy",
      "category_armor_shield",
    ]);
  });
});

describe("weaponProficiencyIds", () => {
  it("names the item and every category tag it carries", () => {
    expect(
      weaponProficiencyIds({
        id: "item_weapon_greataxe",
        name: "Greataxe",
        categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
        category: "martial_melee",
        damageDice: "1d12",
        damageType: "slashing",
        properties: ["heavy", "two_handed"],
        range: 5,
      }),
    ).toEqual([
      "item_weapon_greataxe",
      "category_weapon_martial",
      "category_weapon_martial_melee",
    ]);
  });
});

describe("isProficientWithWeapon", () => {
  const greataxe = {
    id: "item_weapon_greataxe",
    name: "Greataxe",
    categoryTags: [
      "category_weapon_martial",
      "category_weapon_martial_melee",
    ] as EquipmentDefinition["categoryTags"],
    category: "martial_melee" as const,
    damageDice: "1d12",
    damageType: "slashing" as const,
    properties: ["heavy" as const, "two_handed" as const],
    range: 5,
  };

  it("accepts a category grant", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "category_weapon_martial",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(true);
  });

  it("accepts a grant naming the item itself", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "item_weapon_greataxe",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(true);
  });

  it("rejects the same id under a different proficiency category", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "armor",
            proficiencyId: "category_weapon_martial",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(false);
  });

  it("rejects the weapon's mechanical category, which is not a proficiency id", () => {
    expect(
      isProficientWithWeapon(
        [
          {
            category: "weapons",
            proficiencyId: "martial_melee",
            level: "proficient",
            requiredStates: [],
          },
        ],
        greataxe,
      ),
    ).toBe(false);
  });
});
