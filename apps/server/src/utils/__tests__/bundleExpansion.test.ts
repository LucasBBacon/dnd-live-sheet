import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extractItemsForMigration } from "@project/database/src/itemsExtraction.js";
import { resolveItemPayload } from "../inventory.js";

/**
 * The same mocked-database harness inventory.test.ts uses, driven by the real
 * catalogue instead of hand-built rows.
 *
 * inventory.test.ts already proves resolveItemPayload unpacks nested bundles;
 * what it cannot prove is that the shipped data reaches it in a shape it can
 * unpack. Until this file, no test connected the two.
 */
const { mockEq, mockItemsTable, mockBundleContentsTable } = vi.hoisted(() => ({
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockItemsTable: { id: "items.id", isBundle: "items.isBundle" },
  mockBundleContentsTable: { bundleId: "bundle_contents.bundle_id" },
}));

let itemRowsById = new Map<string, { id: string; isBundle: boolean }>();
let bundleRowsById = new Map<string, Array<{ itemId: string; quantity: number }>>();

vi.mock("drizzle-orm", () => ({ eq: mockEq }));

vi.mock("@project/database/src/schema/reference.js", () => ({
  items: mockItemsTable,
  bundleContents: mockBundleContentsTable,
}));

vi.mock("@project/database/src/schema/operational.js", () => ({
  characterInventory: { table: "character_inventory" },
}));

vi.mock("@project/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((condition: { value: string }) => {
          if (table === mockItemsTable) {
            const item = itemRowsById.get(condition.value);
            return Promise.resolve(item ? [item] : []);
          }
          if (table === mockBundleContentsTable) {
            return Promise.resolve(bundleRowsById.get(condition.value) ?? []);
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  },
}));

const resolve = createRequire(import.meta.url).resolve;

const rawItems = JSON.parse(
  readFileSync(resolve("@project/database/data/items.json"), "utf-8"),
) as unknown[];

beforeEach(() => {
  const extracted = extractItemsForMigration(rawItems);

  itemRowsById = new Map(
    extracted.seedItems.map((item) => [
      item.id,
      { id: item.id, isBundle: item.isBundle },
    ]),
  );

  bundleRowsById = new Map();
  for (const entry of extracted.bundleContents) {
    const existing = bundleRowsById.get(entry.bundleId) ?? [];
    existing.push({ itemId: entry.itemId, quantity: entry.quantity });
    bundleRowsById.set(entry.bundleId, existing);
  }
});

describe("the shipped catalogue expands through the acquisition path", () => {
  it("unpacks an Explorer's Pack into its eight line items", async () => {
    const resolved = await resolveItemPayload(null, "item_pack_explorers", 1);

    expect(resolved).toEqual(
      expect.arrayContaining([
        { id: "item_backpack", quantity: 1 },
        { id: "item_bedroll", quantity: 1 },
        { id: "item_mess_kit", quantity: 1 },
        { id: "item_tinderbox", quantity: 1 },
        { id: "item_torch", quantity: 10 },
        { id: "item_rations", quantity: 10 },
        { id: "item_waterskin", quantity: 1 },
        { id: "item_rope_hempen", quantity: 1 },
      ]),
    );
    expect(resolved).toHaveLength(8);
    // the pack itself must not survive expansion, or its 59 lb is counted
    // twice - once as the pack and once as everything in it
    expect(resolved.map((r) => r.id)).not.toContain("item_pack_explorers");
  });

  it("multiplies contents when more than one pack is taken", async () => {
    const resolved = await resolveItemPayload(null, "item_pack_priests", 2);
    const candles = resolved.find((r) => r.id === "item_candle");

    expect(candles).toEqual({ id: "item_candle", quantity: 20 });
  });

  it("leaves a non-bundle item alone", async () => {
    expect(await resolveItemPayload(null, "item_armor_plate", 3)).toEqual([
      { id: "item_armor_plate", quantity: 3 },
    ]);
  });
});
