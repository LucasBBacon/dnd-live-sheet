import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoreRulePackSchema } from "@project/shared";
import { assembleCoreRulePack } from "../corePackAssembler.js";
import { loadCoreRulePack } from "../corePackLoader.js";
import { projectCoreRulePack } from "../corePackProjection.js";

const createPack = () =>
  CoreRulePackSchema.parse({
    pack: {
      packId: "core_test",
      version: 7,
      ruleset: "dnd_5e_2014",
      publishedAt: "2026-08-13T00:00:00.000Z",
    },
    traits: [
      {
        id: "trait_test",
        name: "Test Trait",
        lore: { shortDescription: "Test trait lore." },
      },
    ],
    classes: [
      {
        id: "class_test",
        name: "Test Class",
        hitDie: 8,
        subclassUnlockLevel: 3,
        lore: { shortDescription: "Test class lore." },
        progression: [{ level: 1, grants: ["trait_test"] }],
      },
    ],
    equipment: [
      {
        id: "item_ammo_test",
        name: "Test Arrow",
        type: "gear",
        weight: 0.05,
        ammoTag: "arrow",
        lore: { shortDescription: "Test ammunition lore." },
      },
      {
        id: "item_weapon_test",
        name: "Test Bow",
        type: "weapon",
        weight: 2,
        lore: { shortDescription: "Test weapon lore." },
        weapon: {
          category: "simple_ranged",
          damageDice: "1d6",
          damageType: "piercing",
          properties: ["ammunition"],
          ammoItemId: "item_ammo_test",
          ammoTag: "arrow",
        },
      },
    ],
  });

describe("loadCoreRulePack", () => {
  it("parses and semantically validates a canonical pack file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dnd-core-pack-"));
    const filePath = join(directory, "core-rule-pack.json");
    await writeFile(filePath, JSON.stringify(createPack()), "utf8");

    await expect(loadCoreRulePack(filePath)).resolves.toMatchObject({
      pack: { packId: "core_test", version: 7 },
    });
  });

  it("rejects a pack with semantic reference errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dnd-core-pack-"));
    const filePath = join(directory, "invalid-core-rule-pack.json");
    const source = createPack();
    source.classes[0]!.progression[0]!.grants = ["trait_missing"];
    await writeFile(filePath, JSON.stringify(source), "utf8");

    await expect(loadCoreRulePack(filePath)).rejects.toThrow("trait_missing");
  });
});

describe("projectCoreRulePack", () => {
  it("preserves the validated pack and derives relational query rows", () => {
    const pack = createPack();
    const projection = projectCoreRulePack(pack);

    expect(projection.corePack).toBe(pack);
    expect(projection.items).toContainEqual(
      expect.objectContaining({
        id: "item_weapon_test",
        weight: 200,
        weaponRule: expect.objectContaining({ ammoItemId: "item_ammo_test" }),
      }),
    );
    expect(projection.classProgressions).toEqual([
      { classId: "class_test", level: 1, traitId: "trait_test" },
    ]);
  });

  it("carries the whole trait into the database row", () => {
    const pack = CoreRulePackSchema.parse({
      pack: {
        packId: "core_test",
        version: 7,
        ruleset: "dnd_5e_2014",
        publishedAt: "2026-08-13T00:00:00.000Z",
      },
      traits: [
        {
          id: "trait_test",
          name: "Test Trait",
          lore: { shortDescription: "Test trait lore." },
          modifiers: {
            fixed: [{ target: "MAX_HP", type: "add", value: 2 }],
            choices: [],
          },
        },
      ],
    });

    const projection = projectCoreRulePack(pack);

    // effects: [] was a placeholder that made every core trait look empty
    expect(projection.traits[0]?.definition.modifiers.fixed[0]?.target).toBe(
      "MAX_HP",
    );
  });
});

describe("projectCoreRulePack strips pack-only fields from itemRule", () => {
  // A hand-written fixture would not stress this: the field this guards
  // against leaking (implementation) only exists on real pack data, and a
  // synthetic item that happened not to author it would pass whether or not
  // toItemRule still stripped it. Reading the shipped pack is the only thing
  // that catches that, the same reasoning ruleSnapshotSeam.test.ts uses.
  const SHIPPED_PACK = join(process.cwd(), "data/packs/core_2014_pack");

  it("does not leak lore, isBundle, bundleContents or implementation into itemRule", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const projection = projectCoreRulePack(pack);

    // item_armor_breastplate is one of 29 items in equipment/legacy.json
    // that authors "implementation" (it is missing its AC and armour
    // category); item_pack_explorers is one of 4 in equipment/core.json
    // that authors "isBundle"/"bundleContents". EquipmentDefinitionSchema is
    // strict, so if toItemRule ever stops stripping these, every stored
    // item_rule for these items fails the moment ruleSnapshotProjection
    // reads it back - see apps/server/.../ruleSnapshotProjection.ts.
    const breastplate = projection.items.find(
      (item) => item.id === "item_armor_breastplate",
    );
    const explorersPack = projection.items.find(
      (item) => item.id === "item_pack_explorers",
    );

    expect(breastplate).toBeDefined();
    expect(explorersPack).toBeDefined();

    for (const item of [breastplate!, explorersPack!]) {
      expect(item.itemRule).not.toHaveProperty("lore");
      expect(item.itemRule).not.toHaveProperty("isBundle");
      expect(item.itemRule).not.toHaveProperty("bundleContents");
      expect(item.itemRule).not.toHaveProperty("implementation");
    }
  });
});
