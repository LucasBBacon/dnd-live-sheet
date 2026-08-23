import { describe, expect, it } from "vitest";
import { RuleSnapshotSchema } from "../runtime/ruleSnapshot.js";
import { ResourceResetSchema, ResourceSchema } from "../content/resources.js";

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

    expect(ResourceSchema.parse(rule)).toEqual(rule);
  });

  it("rejects legacy executable resource definitions", () => {
    expect(() =>
      ResourceSchema.parse({
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
      equipmentById: {
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
        item_weapon_dagger: {
          id: "item_weapon_dagger",
          name: "Dagger",
          type: "weapon",
          weapon: {
            category: "simple_melee",
            damageDice: "1d4",
            damageType: "piercing",
            properties: ["finesse", "light", "thrown"],
          },
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
          modifiers: {
            fixed: [
              {
                target: "MAX_HP",
                type: "add",
                value: 2,
                scalingFactor: "total_level",
              },
            ],
            choices: [],
          },
        },
      },
    };

    const parsed = RuleSnapshotSchema.parse(snapshot);

    expect(parsed).toMatchObject(snapshot);
    expect(parsed.equipmentById.item_armor_shield).toMatchObject({
      weight: 0,
      requiresAttunement: false,
    });
    expect(
      parsed.equipmentById.item_armor_shield?.modifiers?.[0],
    ).toMatchObject({
      requiredStates: [],
      forbiddenStates: [],
    });
    expect(parsed.equipmentById.item_weapon_dagger?.weapon?.damageDice).toBe(
      "1d4",
    );
    expect(parsed.traitsById.feat_tough?.modifiers.fixed[0]).toMatchObject({
      requiredStates: [],
      forbiddenStates: [],
    });
  });
});

describe("a RuleSnapshot holds real traits", () => {
  const snapshotWith = (trait: unknown) => ({
    equipmentById: {},
    resourcesById: {},
    traitsById: { trait_test: trait },
  });

  it("accepts a trait with the fixed/choices modifier block", () => {
    const result = RuleSnapshotSchema.safeParse(
      snapshotWith({
        id: "trait_test",
        name: "Test",
        modifiers: {
          fixed: [{ target: "MAX_HP", type: "add", value: 2 }],
          choices: [],
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a trait carrying resources and implementation metadata", () => {
    const result = RuleSnapshotSchema.safeParse(
      snapshotWith({
        id: "trait_test",
        name: "Test",
        implementation: { mode: "engine", summary: "Grants a state." },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe("one resource schema", () => {
  it("accepts the reset conditions from both former enums", () => {
    for (const reset of [
      "short_rest",
      "long_rest",
      "long_rest_half",
      "dawn",
      "never",
      "initiative_roll",
      "start_of_turn",
    ]) {
      expect(ResourceResetSchema.safeParse(reset).success).toBe(true);
    }
  });

  it("uses resetCondition, the name the pack data authors", () => {
    const parsed = ResourceSchema.parse({
      id: "trait_action_surge",
      name: "Action Surge",
      resetCondition: "short_rest",
      maxRule: { kind: "fixed", value: 1 },
    });
    expect(parsed.resetCondition).toBe("short_rest");
  });

  it("accepts a total_level_thresholds max rule", () => {
    expect(
      ResourceSchema.safeParse({
        id: "r",
        name: "R",
        resetCondition: "long_rest",
        maxRule: {
          kind: "total_level_thresholds",
          thresholds: [{ minimumLevel: 1, value: 1 }],
        },
      }).success,
    ).toBe(true);
  });
});
