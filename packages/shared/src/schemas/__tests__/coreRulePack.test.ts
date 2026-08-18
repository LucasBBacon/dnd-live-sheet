import { describe, expect, it } from "vitest";
import {
  CoreRulePackSchema,
  type CoreRulePack,
  validateCoreRulePack,
} from "../coreRulePack.js";

const createValidPack = (): CoreRulePack => {
  const lore = {
    shortDescription: "Minimal authored lore for core-pack validation.",
  };

  return CoreRulePackSchema.parse({
    pack: {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
  },
  traits: [
    {
      id: "trait_test_training",
      name: "Test Training",
      lore,
    },
  ],
  resources: [
    {
      id: "resource_test",
      name: "Test Resource",
      resetCondition: "long_rest",
      maxRule: { kind: "fixed", value: 1 },
    },
  ],
  races: [
    {
      id: "race_test",
      name: "Test Race",
      size: "medium",
      speed: 30,
      lore,
      grantedTraitIds: ["trait_test_training"],
      hasSubraces: false,
      subraces: [],
    },
  ],
  classes: [
    {
      id: "class_test",
      name: "Test Class",
      hitDie: 8,
      subclassUnlockLevel: 3,
      lore,
      progression: [{ level: 1, grants: ["trait_test_training"] }],
    },
  ],
  subclasses: [],
  feats: [],
  backgrounds: [],
  equipment: [
    {
      id: "item_test",
      name: "Test Item",
      type: "gear",
      weight: 1,
      lore,
    },
  ],
  spells: [],
  });
};

describe("CoreRulePackSchema", () => {
  it("parses a minimal, self-contained core pack", () => {
    const pack = CoreRulePackSchema.parse(createValidPack());

    expect(validateCoreRulePack(pack)).toEqual({ ok: true, issues: [] });
  });

  it("rejects undeclared properties rather than accepting accidental data", () => {
    expect(() =>
      CoreRulePackSchema.parse({ ...createValidPack(), unexpected: true }),
    ).toThrow();
  });
});

describe("validateCoreRulePack", () => {
  it("reports duplicate ids across entity families", () => {
    const source = createValidPack();
    source.equipment[0]!.id = "trait_test_training";

    const result = validateCoreRulePack(CoreRulePackSchema.parse(source));

    expect(result).toMatchObject({ ok: false });
    expect(result.issues).toContainEqual({
      code: "duplicate_id",
      path: ["equipment", 0, "id"],
      message: expect.stringContaining("trait_test_training"),
    });
  });

  it("reports dangling trait and ammunition references", () => {
    const source = createValidPack();
    source.classes[0]!.progression[0]!.grants = ["trait_missing"];
    source.equipment.push({
      id: "item_weapon_test",
      name: "Test Bow",
      type: "weapon",
      weight: 2,
      requiresAttunement: false,
      categoryTags: [],
      lore: {
        shortDescription: "Minimal authored lore for a test weapon.",
      },
      isBundle: false,
      bundleContents: [],
      weapon: {
        category: "simple_ranged",
        damageDice: "1d6",
        damageType: "piercing",
        properties: ["ammunition"],
        range: 80,
        ammoItemId: "item_ammo_missing",
        ammoTag: "arrow",
      },
    });

    const result = validateCoreRulePack(CoreRulePackSchema.parse(source));

    expect(result).toMatchObject({ ok: false });
    expect(result.issues).toContainEqual({
      code: "unknown_trait_reference",
      path: ["classes", 0, "progression", 0, "grants", 0],
      message: expect.stringContaining("trait_missing"),
    });
    expect(result.issues).toContainEqual({
      code: "unknown_equipment_reference",
      path: ["equipment", 1, "weapon", "ammoItemId"],
      message: expect.stringContaining("item_ammo_missing"),
    });
  });
});