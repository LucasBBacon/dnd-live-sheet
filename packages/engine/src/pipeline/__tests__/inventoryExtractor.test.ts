import { describe, expect, it } from "vitest";
import type { CharacterSlot, InventoryInstance } from "@project/shared";
import { InventoryExtractor } from "../inventoryExtractor.js";
import { resolveItemDefinition } from "../../rules/ruleLookup.js";

/**
 * Fixtures use real dictionary ids: rule resolution runs in "static-only" mode,
 * so an injected snapshot would be ignored anyway.
 */
const SHIELD = "item_armor_shield";
const RING = "item_ring_of_protection";
const PLATE = "item_armor_plate";
const LEATHER = "item_armor_leather";
/** Worn on the body, but not armor - the distinction the states turn on. */
const ROBE = "item_robe";

const instance = (
  id: string,
  itemId: string,
  slot: CharacterSlot,
  overrides: Partial<InventoryInstance> = {},
): InventoryInstance => ({
  id,
  itemId,
  quantity: 1,
  slot,
  isAttuned: false,
  ...overrides,
});

describe("InventoryExtractor.extract", () => {
  it("returns nothing for an empty bag", () => {
    const result = InventoryExtractor.extract([]);
    expect(result.modifiers).toEqual([]);
    expect(result.report).toEqual([]);
  });

  it("compiles modifiers from a worn item", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", SHIELD, "off_hand"),
    ]);

    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]).toMatchObject({
      id: "inv_1_0",
      target: "ARMOR_CLASS",
      value: 2,
      sourceName: "Shield",
      sourceOrigin: `item:${SHIELD}`,
      isActive: true,
    });
  });

  it("ignores items sitting in the pack", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", SHIELD, "backpack"),
    ]);

    expect(result.modifiers).toEqual([]);
    expect(result.report).toEqual([]);
  });

  it("tolerates unknown items and items with no modifiers", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", "item_ghost", "body"),
      instance("inv_2", "item_weapon_dagger", "main_hand"),
    ]);

    expect(result.modifiers).toEqual([]);
    expect(result.unknownItemIds).toEqual(["item_ghost"]);
    expect(result.report).toHaveLength(1);
  });

  it("prefers the player's custom name as the breakdown source", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", SHIELD, "off_hand", { customName: "Aegis" }),
    ]);

    expect(result.modifiers[0]?.sourceName).toBe("Aegis");
  });

  it("keeps an unattuned item's modifiers but marks them inactive", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", RING, "ring_1"),
    ]);

    expect(result.modifiers).toHaveLength(2);
    expect(result.modifiers.every((mod) => !mod.isActive)).toBe(true);
    expect(result.report[0]?.inactiveReason).toBe("not_attuned");
    expect(result.attunedInstanceIds).toEqual([]);
  });

  it("activates an item once it is both worn and attuned", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", RING, "ring_1", { isAttuned: true }),
    ]);

    expect(result.modifiers.every((mod) => mod.isActive)).toBe(true);
    expect(result.attunedInstanceIds).toEqual(["inv_1"]);
    expect(result.report[0]?.inactiveReason).toBeUndefined();
  });

  it("does not require attunement for an item that never asked for it", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", PLATE, "body"),
    ]);

    expect(result.modifiers.every((mod) => mod.isActive)).toBe(true);
    expect(result.attunedInstanceIds).toEqual([]);
  });

  it("honours only the first three attuned items when a save drifts over cap", () => {
    const items = ["inv_1", "inv_2", "inv_3", "inv_4"].map((id) =>
      instance(id, RING, "ring_1", { isAttuned: true }),
    );

    const result = InventoryExtractor.extract(items);

    expect(result.attunedInstanceIds).toEqual(["inv_1", "inv_2", "inv_3"]);
    expect(result.overAttunedInstanceIds).toEqual(["inv_4"]);
    expect(result.report[3]?.inactiveReason).toBe("over_attunement_limit");
    // the fourth ring's modifiers are still reported, just switched off
    expect(
      result.modifiers.filter((mod) => mod.id.startsWith("inv_4")),
    ).toHaveLength(2);
    expect(
      result.modifiers
        .filter((mod) => mod.id.startsWith("inv_4"))
        .every((mod) => !mod.isActive),
    ).toBe(true);
  });

  it("does not scale a modifier by stack quantity", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", SHIELD, "off_hand", { quantity: 5 }),
    ]);

    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]?.value).toBe(2);
  });

  it("keeps ids unique so competing set_base entries stay distinguishable", () => {
    const result = InventoryExtractor.extract([
      instance("inv_1", PLATE, "body"),
      instance("inv_2", LEATHER, "body"),
    ]);

    const ids = result.modifiers.map((mod) => mod.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("InventoryExtractor.extractStates", () => {
  it("emits nothing for an empty bag", () => {
    expect(InventoryExtractor.extractStates([])).toEqual([]);
  });

  it("emits status_wearing_armor for armor worn on the body", () => {
    expect(
      InventoryExtractor.extractStates([instance("inv_1", PLATE, "body")]),
    ).toContain("status_wearing_armor");
  });

  it("emits the heavy category state for plate", () => {
    expect(
      InventoryExtractor.extractStates([instance("inv_1", PLATE, "body")]),
    ).toContain("status_wearing_heavy_armor");
  });

  it("emits the light category state for leather", () => {
    const states = InventoryExtractor.extractStates([
      instance("inv_1", LEATHER, "body"),
    ]);

    expect(states).toContain("status_wearing_light_armor");
    expect(states).not.toContain("status_wearing_heavy_armor");
  });

  it("emits nothing for armor left in the pack", () => {
    expect(
      InventoryExtractor.extractStates([instance("inv_1", PLATE, "backpack")]),
    ).toEqual([]);
  });

  it("emits nothing for a non-armor item worn in the body slot", () => {
    // guards the guard: if item_robe ever stops resolving as a body-slot
    // non-armor item, this test would pass by resolving to nothing at all
    const robe = resolveItemDefinition(ROBE);
    expect(robe?.equipSlot).toBe("body");
    expect(robe?.type).not.toBe("armor");

    expect(
      InventoryExtractor.extractStates([instance("inv_1", ROBE, "body")]),
    ).toEqual([]);
  });
});
