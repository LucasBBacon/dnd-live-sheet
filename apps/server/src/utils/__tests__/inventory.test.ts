import { beforeEach, describe, expect, it, vi } from "vitest";
import { processStartingEquipment, resolveItemPayload } from "../inventory";

const {
  mockEq,
  mockItemsTable,
  mockBundleContentsTable,
  mockCharacterInventoryTable,
} = vi.hoisted(() => ({
  mockEq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  mockItemsTable: { id: "items.id", isBundle: "items.isBundle" },
  mockBundleContentsTable: { bundleId: "bundle_contents.bundle_id" },
  mockCharacterInventoryTable: { table: "character_inventory" },
}));

let itemRowsById = new Map<string, any>();
let bundleRowsById = new Map<string, any[]>();

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
}));

vi.mock("@project/database/src/schema/reference.js", () => ({
  items: mockItemsTable,
  bundleContents: mockBundleContentsTable,
}));

vi.mock("@project/database/src/schema/operational.js", () => ({
  characterInventory: mockCharacterInventoryTable,
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

describe("inventory utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemRowsById = new Map();
    bundleRowsById = new Map();
  });

  describe("resolveItemPayload", () => {
    it("returns empty array when item does not exist", async () => {
      const result = await resolveItemPayload({}, "missing_item");
      expect(result).toEqual([]);
    });

    it("returns a single row for non-bundle items", async () => {
      itemRowsById.set("item_rope", { id: "item_rope", isBundle: false });

      const result = await resolveItemPayload({}, "item_rope", 2);
      expect(result).toEqual([{ id: "item_rope", quantity: 2 }]);
    });

    it("resolves nested bundle contents recursively", async () => {
      itemRowsById.set("pack_starting", { id: "pack_starting", isBundle: true });
      itemRowsById.set("pack_tools", { id: "pack_tools", isBundle: true });
      itemRowsById.set("item_torch", { id: "item_torch", isBundle: false });
      itemRowsById.set("item_rope", { id: "item_rope", isBundle: false });

      bundleRowsById.set("pack_starting", [
        { itemId: "pack_tools", quantity: 1 },
        { itemId: "item_torch", quantity: 3 },
      ]);
      bundleRowsById.set("pack_tools", [{ itemId: "item_rope", quantity: 2 }]);

      const result = await resolveItemPayload({}, "pack_starting", 2);
      expect(result).toEqual([
        { id: "item_rope", quantity: 4 },
        { id: "item_torch", quantity: 6 },
      ]);
    });
  });

  describe("processStartingEquipment", () => {
    it("does nothing when no raw selections are provided", async () => {
      const tx = {
        insert: vi.fn(),
      };

      await processStartingEquipment(tx, "char_1", []);
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("aggregates duplicate items and performs one insert payload", async () => {
      itemRowsById.set("item_torch", { id: "item_torch", isBundle: false });
      itemRowsById.set("item_rope", { id: "item_rope", isBundle: false });
      itemRowsById.set("pack_tools", { id: "pack_tools", isBundle: true });
      bundleRowsById.set("pack_tools", [
        { itemId: "item_rope", quantity: 2 },
        { itemId: "item_torch", quantity: 1 },
      ]);

      const values = vi.fn().mockResolvedValue(undefined);
      const tx = {
        insert: vi.fn(() => ({ values })),
      };

      await processStartingEquipment(tx, "char_1", [
        { itemId: "item_torch", quantity: 1 },
        { itemId: "pack_tools", quantity: 2 },
      ]);

      expect(tx.insert).toHaveBeenCalledWith(mockCharacterInventoryTable);
      expect(values).toHaveBeenCalledWith(
        expect.arrayContaining([
          { characterId: "char_1", itemId: "item_torch", quantity: 3 },
          { characterId: "char_1", itemId: "item_rope", quantity: 4 },
        ]),
      );
    });
  });
});
