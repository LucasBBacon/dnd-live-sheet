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
      subraces: {},
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
  it("reports duplicate ids within an entity family", () => {
    const source = createValidPack();
    source.equipment.push({ ...source.equipment[0]! });

    const result = validateCoreRulePack(CoreRulePackSchema.parse(source));

    expect(result).toMatchObject({ ok: false });
    expect(result.issues).toContainEqual({
      code: "duplicate_id",
      path: ["equipment", 1, "id"],
      message: expect.stringContaining(source.equipment[0]!.id),
    });
  });

  it("allows an id to be reused by a different entity family", () => {
    // see the note on registerId: an entity carrying the id of the trait it
    // grants is this codebase's convention, not a collision
    const source = createValidPack();
    source.equipment[0]!.id = "trait_test_training";

    const result = validateCoreRulePack(CoreRulePackSchema.parse(source));

    expect(result).toMatchObject({ ok: true });
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

describe("id uniqueness is per section", () => {
  const meta = {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
  };
  const lore = { shortDescription: "Minimal authored lore." };

  it("lets a resource carry the id of the trait that grants it", () => {
    // the established convention: socket.ts documents resourceId as e.g.
    // 'trait_action_surge', and the fighter progression grants a trait of
    // that same id. one global id space would forbid the pair outright.
    const result = validateCoreRulePack(
      CoreRulePackSchema.parse({
        pack: meta,
        traits: [{ id: "trait_action_surge", name: "Action Surge", lore }],
        resources: [
          {
            id: "trait_action_surge",
            name: "Action Surge",
            resetCondition: "short_rest",
            maxRule: { kind: "fixed", value: 1 },
          },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it("still rejects two traits sharing an id", () => {
    const result = validateCoreRulePack(
      CoreRulePackSchema.parse({
        pack: meta,
        traits: [
          { id: "trait_twin", name: "One", lore },
          { id: "trait_twin", name: "Two", lore },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(result.issues).toContainEqual({
      code: "duplicate_id",
      path: ["traits", 1, "id"],
      message: expect.stringContaining("trait_twin"),
    });
  });

  it("treats a race and its subraces as one section", () => {
    // a subrace id must not collide with a race id or another subrace id:
    // both are resolved through the same lookup
    const result = validateCoreRulePack(
      CoreRulePackSchema.parse({
        pack: meta,
        races: [
          {
            id: "race_twin",
            name: "Twin",
            size: "medium",
            speed: 30,
            hasSubraces: true,
            subraces: {
              race_twin: { id: "race_twin", name: "Collides With Its Race" },
            },
          },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: false });
    expect(result.issues[0]).toMatchObject({ code: "duplicate_id" });
  });
});

describe("pack composition", () => {
  const meta = {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
  };

  it("accepts a supplement that names its base and owns nothing", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, packId: "xanathars_2017", extends: ["core_2014"] },
    });

    expect(parsed.pack.extends).toEqual(["core_2014"]);
    expect(parsed.pack.owns).toBeUndefined();
  });

  it("accepts a homebrew system declaring its own ruleset and no base", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, packId: "grimdark_v1", ruleset: "grimdark", extends: [] },
    });

    expect(parsed.pack.ruleset).toBe("grimdark");
    expect(parsed.pack.extends).toEqual([]);
  });

  it("accepts a base pack owning every section", () => {
    const parsed = CoreRulePackSchema.parse({
      pack: { ...meta, owns: ["traits", "classes", "races"] },
    });

    expect(parsed.pack.owns).toContain("classes");
  });

  it("rejects a section name that is not a pack section", () => {
    expect(() =>
      CoreRulePackSchema.parse({ pack: { ...meta, owns: ["monsters"] } }),
    ).toThrow();
  });
});