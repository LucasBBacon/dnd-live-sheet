import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryInstance } from "@project/shared";
import {
  toInventoryInstance,
  useCharacterSheetStore,
} from "../characterSheetStore";

vi.mock("../../services/socketService", () => ({
  socketService: {
    emitInventoryUpdate: vi.fn(),
    emitInventoryConsumed: vi.fn(),
    emitHpModification: vi.fn(),
    emitResourceConsumed: vi.fn(),
    emitRestCompleted: vi.fn(),
  },
}));

const item = (
  id: string,
  itemId: string,
  slot: InventoryInstance["slot"] = "backpack",
): InventoryInstance => ({
  id,
  itemId,
  quantity: 1,
  slot,
  isAttuned: false,
});

const slotOf = (id: string) =>
  useCharacterSheetStore.getState().inventory.find((i) => i.id === id)?.slot;

const seed = (inventory: InventoryInstance[]) =>
  useCharacterSheetStore.setState({ inventory, ruleSnapshot: null });

describe("equipItem slot rules", () => {
  beforeEach(() => {
    seed([]);
  });

  it("puts a ring on a finger, not on the body", () => {
    seed([item("inv_ring", "item_ring_of_protection")]);
    const { equipItem } = useCharacterSheetStore.getState();

    equipItem("inv_ring", "body");
    expect(slotOf("inv_ring")).toBe("backpack");

    equipItem("inv_ring", "ring_1");
    expect(slotOf("inv_ring")).toBe("ring_1");
  });

  it("lets the character wear two rings at once", () => {
    seed([
      item("inv_a", "item_ring_of_protection"),
      item("inv_b", "item_ring_of_protection"),
    ]);
    const { equipItem } = useCharacterSheetStore.getState();

    equipItem("inv_a", "ring_1");
    equipItem("inv_b", "ring_2");

    expect(slotOf("inv_a")).toBe("ring_1");
    expect(slotOf("inv_b")).toBe("ring_2");
  });

  it("evicts the ring already on that finger", () => {
    seed([
      item("inv_a", "item_ring_of_protection", "ring_1"),
      item("inv_b", "item_ring_of_protection"),
    ]);

    useCharacterSheetStore.getState().equipItem("inv_b", "ring_1");

    expect(slotOf("inv_a")).toBe("backpack");
    expect(slotOf("inv_b")).toBe("ring_1");
  });

  it("routes a shield to the off hand and armor to the body", () => {
    seed([
      item("inv_shield", "item_armor_shield"),
      item("inv_plate", "item_armor_plate"),
    ]);
    const { equipItem } = useCharacterSheetStore.getState();

    equipItem("inv_shield", "off_hand");
    equipItem("inv_plate", "body");

    expect(slotOf("inv_shield")).toBe("off_hand");
    expect(slotOf("inv_plate")).toBe("body");
  });

  it("frees the off hand when a two-handed weapon is drawn", () => {
    seed([
      item("inv_shield", "item_armor_shield", "off_hand"),
      item("inv_bow", "item_weapon_longbow"),
    ]);

    useCharacterSheetStore.getState().equipItem("inv_bow", "main_hand");

    expect(slotOf("inv_bow")).toBe("main_hand");
    // the longbow is two-handed, so the shield cannot stay
    expect(slotOf("inv_shield")).toBe("backpack");
  });

  it("stows the two-handed weapon when a shield is raised", () => {
    seed([
      item("inv_bow", "item_weapon_longbow", "main_hand"),
      item("inv_shield", "item_armor_shield"),
    ]);

    useCharacterSheetStore.getState().equipItem("inv_shield", "off_hand");

    expect(slotOf("inv_shield")).toBe("off_hand");
    expect(slotOf("inv_bow")).toBe("backpack");
  });

  it("ignores an unknown slot rather than corrupting state", () => {
    seed([item("inv_plate", "item_armor_plate", "body")]);

    useCharacterSheetStore.getState().equipItem("inv_plate", "trousers");

    expect(slotOf("inv_plate")).toBe("body");
  });

  it("always allows stowing an item back in the pack", () => {
    seed([item("inv_plate", "item_armor_plate", "body")]);

    useCharacterSheetStore.getState().equipItem("inv_plate", "backpack");

    expect(slotOf("inv_plate")).toBe("backpack");
  });

  it("keeps attunement when an item is merely stowed", () => {
    seed([
      { ...item("inv_ring", "item_ring_of_protection", "ring_1"), isAttuned: true },
    ]);

    useCharacterSheetStore.getState().equipItem("inv_ring", "backpack");

    const stowed = useCharacterSheetStore
      .getState()
      .inventory.find((i) => i.id === "inv_ring");

    expect(stowed?.slot).toBe("backpack");
    // still in the character's possession, so attunement survives
    expect(stowed?.isAttuned).toBe(true);
  });
});

describe("toInventoryInstance", () => {
  it("translates the legacy armor slot to body", () => {
    const migrated = toInventoryInstance({
      id: "inv_1",
      itemId: "item_armor_plate",
      quantity: 1,
      slot: "armor",
      isAttuned: false,
    });

    expect(migrated.slot).toBe("body");
  });

  it("translates a legacy single ring slot to the first finger", () => {
    const migrated = toInventoryInstance({
      id: "inv_1",
      itemId: "item_ring_of_protection",
      quantity: 1,
      slot: "ring",
      isAttuned: true,
    });

    expect(migrated.slot).toBe("ring_1");
    expect(migrated.isAttuned).toBe(true);
  });

  it("degrades an unrecognised slot to carried", () => {
    const migrated = toInventoryInstance({
      id: "inv_1",
      itemId: "item_armor_plate",
      quantity: 1,
      slot: "codpiece",
      isAttuned: false,
    });

    expect(migrated.slot).toBe("backpack");
  });

  it("passes a known slot through untouched", () => {
    expect(
      toInventoryInstance({
        id: "inv_1",
        itemId: "item_armor_shield",
        quantity: 1,
        slot: "off_hand",
        isAttuned: false,
      }).slot,
    ).toBe("off_hand");
  });
});
