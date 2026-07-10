import { describe, expect, it } from "vitest";
import {
  ResourceRuleSchema,
  RuleSnapshotSchema,
  WeaponDefinitionSchema,
} from "../rules.js";

describe("Weapon Definition Schema", () => {
  it("accepts a valid weapon definition", () => {
    const weapon = {
      id: "item_longsword",
      name: "Longsword",
      category: "martial_melee",
      damageDice: "1d8",
      damageType: "slashing",
      properties: ["versatile"],
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
        item_shield: {
          id: "item_shield",
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
        item_dagger: {
          id: "item_dagger",
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
});