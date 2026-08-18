import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoreRulePackSchema } from "@project/shared";
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
});
