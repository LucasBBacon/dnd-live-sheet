import { describe, expect, it } from "vitest";
import { ImportPackSchema } from "../importPack.js";

describe("ImportPackSchema", () => {
  it("accepts a valid core pack with typed entries and relations", () => {
    const payload = {
      pack: {
        packId: "core_2014_patch_1",
        name: "Core 2014 Patch 1",
        schemaVersion: "1.0.0",
        sourceType: "core",
        publishMode: "published",
        conflictPolicy: "upsert",
        idPolicy: "stable",
      },
      entries: [
        {
          kind: "trait",
          id: "trait_test_feature",
          op: "upsert",
          data: {
            name: "Test Feature",
            lore: { shortDescription: "Trait test." },
            effects: [],
            isStartingProficiency: false,
          },
        },
        {
          kind: "item",
          id: "item_test_blade",
          op: "upsert",
          data: {
            name: "Test Blade",
            weight: 300,
            description: "A test blade.",
            isBundle: false,
            itemRule: {
              id: "item_test_blade",
              name: "Test Blade",
              type: "weapon",
            },
            weaponRule: {
              id: "item_test_blade",
              name: "Test Blade",
              category: "martial_melee",
              damageDice: "1d8",
              damageType: "slashing",
              properties: ["versatile"],
            },
          },
        },
      ],
      relations: [
        {
          kind: "bundle_content",
          op: "add",
          bundleId: "item_pack_test",
          itemId: "item_test_blade",
          quantity: 1,
        },
      ],
    };

    const parsed = ImportPackSchema.parse(payload);
    expect(parsed.pack.packId).toBe("core_2014_patch_1");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.relations).toHaveLength(1);
  });

  it("rejects core packs that are not published", () => {
    const result = ImportPackSchema.safeParse({
      pack: {
        packId: "core_bad",
        name: "Core Draft",
        schemaVersion: "1.0.0",
        sourceType: "core",
        publishMode: "draft",
      },
      entries: [],
      relations: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects homebrew packs missing campaign ownership metadata", () => {
    const result = ImportPackSchema.safeParse({
      pack: {
        packId: "homebrew_bad",
        name: "Broken Homebrew",
        schemaVersion: "1.0.0",
        sourceType: "homebrew",
        publishMode: "draft",
      },
      entries: [],
      relations: [],
    });

    expect(result.success).toBe(false);
  });
});
