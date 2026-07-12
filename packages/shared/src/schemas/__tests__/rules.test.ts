import { describe, expect, it } from "vitest";
import {
  ResourceRuleSchema,
  RuleSnapshotSchema,
  WeaponDefinitionSchema,
} from "../rules.js";

describe("Weapon Definition Schema", () => {
  it("accepts a valid weapon definition", () => {
    const weapon = {
      id: "item_weapon_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      damageType: "slashing",
      properties: ["versatile"],
    };

    expect(WeaponDefinitionSchema.parse(weapon)).toEqual(weapon);
  });

  it("accepts loading and special properties", () => {
    const weapon = {
      id: "item_weapon_crossbow_heavy",
      name: "Heavy Crossbow",
      category: "martial_ranged",
      damageDice: "1d10",
      damageType: "piercing",
      properties: ["ammunition", "heavy", "loading", "two_handed", "special"],
    };

    expect(WeaponDefinitionSchema.parse(weapon)).toEqual(weapon);
  });
});

describe("Resource Rule Schema", () => {
  it("accepts declarative class-threshold rules", () => {
    const rule = {
      id: "trait_action_surge",
      name: "Action Surge",
      resetCondition: "short_rest",
      maxRule: {
        kind: "class_level_thresholds",
        classId: "class_fighter",
        thresholds: [
          { minimumLevel: 2, value: 1 },
          { minimumLevel: 17, value: 2 },
        ],
      },
    };

    expect(ResourceRuleSchema.parse(rule)).toEqual(rule);
  });

  it("rejects legacy executable resource definitions", () => {
    expect(() =>
      ResourceRuleSchema.parse({
        id: "trait_action_surge",
        name: "Action Surge",
        resetCondition: "short_rest",
        getMax: () => 1,
      })
    ).toThrow();
  });
});

describe("Rule Snapshot Schema", () => {
  it("accepts a transport-safe snapshot", () => {
    const snapshot = {
      itemsById: {
        item_armor_shield: {
          id: "item_armor_shield",
          name: "Shield",
          type: "armor",
          modifiers: [
            {
              target: "ARMOR_CLASS",
              type: "add",
              value: 2,
              scalingFactor: "none",
            },
          ],
        },
      },
      resourcesById: {
        trait_second_wind: {
          id: "trait_second_wind",
          name: "Second Wind",
          resetCondition: "short_rest",
          maxRule: {
            kind: "class_level_thresholds",
            classId: "class_fighter",
            thresholds: [{ minimumLevel: 1, value: 1 }],
          },
        },
      },
      traitsById: {
        feat_tough: {
          id: "feat_tough",
          name: "Tough",
          modifiers: [
            {
              target: "MAX_HP",
              type: "add",
              value: 2,
              scalingFactor: "total_level",
            },
          ],
        },
      },
      weaponsById: {
        item_weapon_dagger: {
          id: "item_weapon_dagger",
          name: "Dagger",
          category: "simple_melee",
          damageDice: "1d4",
          damageType: "piercing",
          properties: ["finesse", "light", "thrown"],
        },
      },
    };

    expect(RuleSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts snapshot with canonical equipmentById field", () => {
    const snapshot = {
      itemsById: {},
      resourcesById: {},
      traitsById: {},
      weaponsById: {},
      equipmentById: {
        item_weapon_longsword: {
          id: "item_weapon_longsword",
          name: "Longsword",
          type: "weapon",
          weapon: {
            category: "martial_melee",
            damageDice: "1d8",
            damageType: "slashing",
            properties: ["versatile"],
          },
        },
      },
    };

    const parsed = RuleSnapshotSchema.parse(snapshot);
    expect(parsed.equipmentById?.item_weapon_longsword?.name).toBe("Longsword");
    expect(parsed.equipmentById?.item_weapon_longsword?.weapon?.category).toBe("martial_melee");
  });

  it("accepts snapshot without optional equipmentById (backwards compatibility)", () => {
    const snapshot = {
      itemsById: {},
      resourcesById: {},
      traitsById: {},
      weaponsById: {},
    };

    const parsed = RuleSnapshotSchema.parse(snapshot);
    expect(parsed.equipmentById).toBeUndefined();
  });
});