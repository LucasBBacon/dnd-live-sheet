import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/src/corePackAssembler.js";
import path from "node:path";
import { resolveItemPayload } from "../inventory.js";

/**
 * The same mocked-database harness inventory.test.ts uses, driven by the real
 * catalogue instead of hand-built rows.
 *
 * inventory.test.ts already proves resolveItemPayload unpacks nested bundles;
 * what it cannot prove is that the shipped data reaches it in a shape it can
 * unpack. Until this file, no test connected the two.
 *
 * The catalogue is the assembled pack now rather than items.json projected
 * through the seed: the pack is the only source, and these rows are what the
 * importer writes into the tables this harness stands in for.
 */
const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);
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

beforeEach(async () => {
  const pack = await assembleCoreRulePack(PACK_DIR);

  itemRowsById = new Map(
    pack.equipment.map((item) => [
      item.id,
      { id: item.id, isBundle: item.isBundle },
    ]),
  );

  bundleRowsById = new Map();
  for (const item of pack.equipment) {
    if (item.bundleContents.length === 0) continue;
    bundleRowsById.set(
      item.id,
      item.bundleContents.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
      })),
    );
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
