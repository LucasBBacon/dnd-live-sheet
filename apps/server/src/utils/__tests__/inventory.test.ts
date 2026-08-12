import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bundleContents,
  items,
} from "@project/database/src/schema/reference.js";
import { characterInventory } from "@project/database/src/schema/operational.js";
import {
  processStartingEquipment,
  resolveCategoryPayload,
  resolveItemPayload,
} from "../inventory.js";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();

  return {
    ...actual,
    eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  };
});

let itemRowsById = new Map<string, any>();
let bundleRowsById = new Map<string, any[]>();
let allItemRows: any[] = [];

type TestTx = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

const createTx = (): TestTx => {
  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => {
      const query = {
        where: vi.fn((condition: { value: string }) => {
          if (table === items) {
            const item = itemRowsById.get(condition.value);
            return Promise.resolve(item ? [item] : []);
          }

          if (table === bundleContents) {
            return Promise.resolve(bundleRowsById.get(condition.value) ?? []);
          }

          return Promise.resolve([]);
        }),
        then: (resolve: (rows: any[]) => unknown) => {
          if (table === items) {
            return Promise.resolve(resolve(allItemRows));
          }

          if (table === bundleContents) {
            return Promise.resolve(resolve([]));
          }

          return Promise.resolve(resolve([]));
        },
      };

      return query;
    }),
  }));

  return {
    select,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  };
};

describe("inventory utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemRowsById = new Map();
    bundleRowsById = new Map();
    allItemRows = [];
  });

  describe("resolveItemPayload", () => {
    it("returns empty array when item does not exist", async () => {
      const tx = createTx();
      const result = await resolveItemPayload(tx, "missing_item");

      expect(result).toEqual([]);
    });

    it("returns a single row for non-bundle items", async () => {
      itemRowsById.set("item_rope", { id: "item_rope", isBundle: false });

      const tx = createTx();
      const result = await resolveItemPayload(tx, "item_rope", 2);

      expect(result).toEqual([{ id: "item_rope", quantity: 2 }]);
    });

    it("resolves nested bundle contents recursively", async () => {
      itemRowsById.set("pack_starting", {
        id: "pack_starting",
        isBundle: true,
      });
      itemRowsById.set("pack_tools", { id: "pack_tools", isBundle: true });
      itemRowsById.set("item_torch", { id: "item_torch", isBundle: false });
      itemRowsById.set("item_rope", { id: "item_rope", isBundle: false });

      bundleRowsById.set("pack_starting", [
        { itemId: "pack_tools", quantity: 1 },
        { itemId: "item_torch", quantity: 3 },
      ]);
      bundleRowsById.set("pack_tools", [{ itemId: "item_rope", quantity: 2 }]);

      const tx = createTx();
      const result = await resolveItemPayload(tx, "pack_starting", 2);

      expect(result).toEqual([
        { id: "item_rope", quantity: 4 },
        { id: "item_torch", quantity: 6 },
      ]);
    });
  });

  describe("resolveCategoryPayload", () => {
    it("returns empty array when no item has the requested category tag", async () => {
      allItemRows = [
        {
          id: "item_weapon_longsword",
          name: "Longsword",
          itemRule: { categoryTags: ["category_weapon_martial"] },
          isBundle: false,
        },
      ];

      const tx = createTx();
      const result = await resolveCategoryPayload(tx, "category_holy_symbol");

      expect(result).toEqual([]);
    });

    it("returns empty array when matching candidates are missing category tags", async () => {
      allItemRows = [
        {
          id: "item_holy_symbol_amulet",
          name: "Holy Symbol (Amulet)",
          itemRule: { categoryTags: [] },
          isBundle: false,
        },
      ];

      const tx = createTx();
      const result = await resolveCategoryPayload(tx, "category_holy_symbol");

      expect(result).toEqual([]);
    });

    it("chooses deterministically by name then id among tagged matches", async () => {
      allItemRows = [
        {
          id: "item_focus_wand",
          name: "Wand",
          itemRule: { categoryTags: ["category_arcane_focus"] },
          isBundle: false,
        },
        {
          id: "item_focus_orb",
          name: "Orb",
          itemRule: { categoryTags: ["category_arcane_focus"] },
          isBundle: false,
        },
      ];

      itemRowsById.set("item_focus_wand", {
        id: "item_focus_wand",
        isBundle: false,
      });
      itemRowsById.set("item_focus_orb", {
        id: "item_focus_orb",
        isBundle: false,
      });

      const tx = createTx();
      const result = await resolveCategoryPayload(
        tx,
        "category_arcane_focus",
        2,
      );

      expect(result).toEqual([{ id: "item_focus_orb", quantity: 2 }]);
    });
  });

  describe("processStartingEquipment", () => {
    it("does nothing when no raw selections are provided", async () => {
      const tx = createTx();

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
      const tx = createTx();
      tx.insert = vi.fn(() => ({ values }));

      await processStartingEquipment(tx, "char_1", {
        given: [
          { kind: "item", refId: "item_torch", quantity: 1 },
          { kind: "item", refId: "pack_tools", quantity: 2 },
        ],
      });

      expect(tx.insert).toHaveBeenCalledWith(characterInventory);
      expect(values).toHaveBeenCalledWith(
        expect.arrayContaining([
          { characterId: "char_1", itemId: "item_torch", quantity: 3 },
          { characterId: "char_1", itemId: "item_rope", quantity: 4 },
        ]),
      );
    });

    it("resolves typed starting equipment definitions with item grants", async () => {
      itemRowsById.set("item_torch", { id: "item_torch", isBundle: false });

      const values = vi.fn().mockResolvedValue(undefined);
      const tx = createTx();
      tx.insert = vi.fn(() => ({ values }));

      await processStartingEquipment(tx, "char_1", {
        given: [{ kind: "item", refId: "item_torch", quantity: 2 }],
      } as any);

      expect(tx.insert).toHaveBeenCalledWith(characterInventory);
      expect(values).toHaveBeenCalledWith([
        { characterId: "char_1", itemId: "item_torch", quantity: 2 },
      ]);
    });

    it("rejects unresolved choice-based starting equipment payloads", async () => {
      const tx = createTx();

      await expect(
        processStartingEquipment(tx, "char_1", {
          given: [],
          choices: [
            {
              choose: 1,
              options: [
                {
                  equipmentBundle: [
                    { kind: "item", refId: "item_torch", quantity: 2 },
                  ],
                },
              ],
            },
          ],
        } as any),
      ).rejects.toThrow(
        "Starting equipment choices must be resolved before inventory processing.",
      );

      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("rejects unresolved category grants in given selections", async () => {
      const tx = createTx();

      await expect(
        processStartingEquipment(tx, "char_1", {
          given: [
            {
              kind: "category",
              refId: "category_weapon_simple",
              quantity: 1,
            },
          ],
          choices: [],
        } as any),
      ).rejects.toThrow(
        "Starting equipment categories must be resolved before inventory processing.",
      );

      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("ignores malformed starting equipment payloads instead of crashing", async () => {
      const tx = createTx();

      await expect(
        processStartingEquipment(tx, "char_1", {
          given: { kind: "item", refId: "item_torch" },
        } as any),
      ).resolves.toBeUndefined();

      expect(tx.insert).not.toHaveBeenCalled();
    });
  });
});
