import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryInstance } from "@project/shared";
import {
  toInventoryInstance,
  useCharacterSheetStore,
} from "../characterSheetStore";
import { packRuleSnapshot } from "./packFixture";

vi.mock("../../services/socketService", () => ({
  socketService: {
    emitInventoryUpdate: vi.fn(),
    emitAttunementUpdate: vi.fn(),
    emitInventoryConsumed: vi.fn(),
    emitHpModification: vi.fn(),
    emitResourceConsumed: vi.fn(),
    emitRestCompleted: vi.fn(),
  },
}));

const { socketService } = await import("../../services/socketService");
const emitAttunement = vi.mocked(socketService.emitAttunementUpdate);

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
  // slot rules are read off the item definition, which only the pack carries
  useCharacterSheetStore.setState({
    inventory,
    ruleSnapshot: packRuleSnapshot(),
  });

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

describe("stack splitting and merging", () => {
  beforeEach(() => {
    seed([]);
  });

  const rows = () => useCharacterSheetStore.getState().inventory;
  const worn = () => rows().filter((row) => row.slot !== "backpack");
  const carried = () => rows().filter((row) => row.slot === "backpack");

  it("peels one item off a stack instead of equipping the whole pile", () => {
    seed([{ ...item("inv_daggers", "item_weapon_dagger"), quantity: 5 }]);

    useCharacterSheetStore.getState().equipItem("inv_daggers", "main_hand");

    expect(worn()).toHaveLength(1);
    expect(worn()[0]?.quantity).toBe(1);
    // the remaining four stay behind as their own pile
    expect(carried()).toHaveLength(1);
    expect(carried()[0]?.quantity).toBe(4);
    expect(carried()[0]?.id).toBe("inv_daggers");
  });

  it("gives the split-off row a distinct id", () => {
    seed([{ ...item("inv_daggers", "item_weapon_dagger"), quantity: 2 }]);

    useCharacterSheetStore.getState().equipItem("inv_daggers", "main_hand");

    expect(worn()[0]?.id).not.toBe("inv_daggers");
    expect(new Set(rows().map((row) => row.id)).size).toBe(rows().length);
  });

  it("does not split a stack of one", () => {
    seed([item("inv_dagger", "item_weapon_dagger")]);

    useCharacterSheetStore.getState().equipItem("inv_dagger", "main_hand");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.id).toBe("inv_dagger");
  });

  it("merges a stowed item back into its pile", () => {
    seed([
      { ...item("inv_pile", "item_weapon_dagger"), quantity: 4 },
      item("inv_held", "item_weapon_dagger", "main_hand"),
    ]);

    useCharacterSheetStore.getState().equipItem("inv_held", "backpack");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.id).toBe("inv_pile");
    expect(rows()[0]?.quantity).toBe(5);
  });

  it("round-trips a stack back to its original shape", () => {
    seed([{ ...item("inv_daggers", "item_weapon_dagger"), quantity: 5 }]);
    const { equipItem } = useCharacterSheetStore.getState();

    equipItem("inv_daggers", "main_hand");
    const splitId = worn()[0]?.id as string;
    equipItem(splitId, "backpack");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.quantity).toBe(5);
  });

  it("keeps a renamed item out of the common pile", () => {
    seed([
      { ...item("inv_pile", "item_weapon_dagger"), quantity: 3 },
      {
        ...item("inv_named", "item_weapon_dagger", "main_hand"),
        customName: "Sting",
      },
    ]);

    useCharacterSheetStore.getState().equipItem("inv_named", "backpack");

    expect(rows()).toHaveLength(2);
    expect(rows().find((row) => row.id === "inv_named")?.quantity).toBe(1);
  });

  it("keeps an attuned item out of the common pile", () => {
    seed([
      item("inv_pile", "item_ring_of_protection"),
      {
        ...item("inv_worn", "item_ring_of_protection", "ring_1"),
        isAttuned: true,
      },
    ]);

    useCharacterSheetStore.getState().equipItem("inv_worn", "backpack");

    expect(rows()).toHaveLength(2);
    expect(rows().find((row) => row.id === "inv_worn")?.isAttuned).toBe(true);
  });

  it("merges an evicted item back into its pile too", () => {
    seed([
      { ...item("inv_pile", "item_weapon_dagger"), quantity: 2 },
      item("inv_held", "item_weapon_dagger", "main_hand"),
      item("inv_bow", "item_weapon_longbow"),
    ]);

    // the two-handed longbow evicts the held dagger, which then rejoins its pile
    useCharacterSheetStore.getState().equipItem("inv_bow", "main_hand");

    expect(carried()).toHaveLength(1);
    expect(carried()[0]?.id).toBe("inv_pile");
    expect(carried()[0]?.quantity).toBe(3);
  });

  it("never mutates the previous inventory rows", () => {
    const pile = { ...item("inv_pile", "item_weapon_dagger"), quantity: 4 };
    seed([pile, item("inv_held", "item_weapon_dagger", "main_hand")]);
    const before = useCharacterSheetStore.getState().inventory;

    useCharacterSheetStore.getState().equipItem("inv_held", "backpack");

    // the merged pile must be a new object, or subscribers never re-render
    expect(before[0]?.quantity).toBe(4);
    expect(pile.quantity).toBe(4);
    expect(rows()[0]).not.toBe(before[0]);
  });

  it("ignores a move that changes nothing", () => {
    seed([item("inv_plate", "item_armor_plate", "body")]);
    const before = useCharacterSheetStore.getState().inventory;

    useCharacterSheetStore.getState().equipItem("inv_plate", "body");

    expect(useCharacterSheetStore.getState().inventory).toBe(before);
  });
});

describe("toggleAttunement", () => {
  beforeEach(() => {
    seed([]);
    useCharacterSheetStore.setState({ inventoryError: null });
  });

  const errorText = () => useCharacterSheetStore.getState().inventoryError;
  const attunedOf = (id: string) =>
    useCharacterSheetStore.getState().inventory.find((i) => i.id === id)
      ?.isAttuned;

  it("attunes a worn item that asks for it", () => {
    seed([item("inv_ring", "item_ring_of_protection", "ring_1")]);

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    expect(attunedOf("inv_ring")).toBe(true);
    expect(errorText()).toBeNull();
  });

  it("refuses to attune an item still in the pack", () => {
    seed([item("inv_ring", "item_ring_of_protection")]);

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    expect(attunedOf("inv_ring")).toBe(false);
    expect(errorText()).toMatch(/must be equipped/i);
  });

  it("ignores an item that does not require attunement", () => {
    seed([item("inv_plate", "item_armor_plate", "body")]);

    useCharacterSheetStore.getState().toggleAttunement("inv_plate");

    expect(attunedOf("inv_plate")).toBe(false);
    expect(errorText()).toBeNull();
  });

  it("stops at three attunements and says why", () => {
    seed([
      { ...item("a", "item_ring_of_protection", "ring_1"), isAttuned: true },
      { ...item("b", "item_ring_of_protection", "ring_2"), isAttuned: true },
      { ...item("c", "item_ring_of_protection", "amulet"), isAttuned: true },
      item("d", "item_ring_of_protection", "cloak"),
    ]);

    useCharacterSheetStore.getState().toggleAttunement("d");

    expect(attunedOf("d")).toBe(false);
    expect(errorText()).toMatch(/already attuned to 3/i);
  });

  it("lets a freed row rejoin its pile when attunement breaks", () => {
    seed([
      item("inv_pile", "item_ring_of_protection"),
      { ...item("inv_ring", "item_ring_of_protection"), isAttuned: true },
    ]);

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    const inventory = useCharacterSheetStore.getState().inventory;
    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.quantity).toBe(2);
  });
});

describe("attunement wiring", () => {
  beforeEach(() => {
    seed([]);
    useCharacterSheetStore.setState({ id: "char_1", inventoryError: null });
    emitAttunement.mockClear();
  });

  const attunedOf = (id: string) =>
    useCharacterSheetStore.getState().inventory.find((i) => i.id === id)
      ?.isAttuned;

  it("broadcasts the absolute state rather than a toggle", () => {
    seed([item("inv_ring", "item_ring_of_protection", "ring_1")]);
    useCharacterSheetStore.setState({ id: "char_1" });

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    expect(emitAttunement).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "char_1",
        inventoryId: "inv_ring",
        isAttuned: true,
      }),
    );
  });

  it("broadcasts the break too", () => {
    seed([
      {
        ...item("inv_ring", "item_ring_of_protection", "ring_1"),
        isAttuned: true,
      },
    ]);
    useCharacterSheetStore.setState({ id: "char_1" });

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    expect(emitAttunement).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryId: "inv_ring", isAttuned: false }),
    );
  });

  it("stays silent when the toggle was refused", () => {
    seed([item("inv_ring", "item_ring_of_protection")]); // still in the pack

    useCharacterSheetStore.getState().toggleAttunement("inv_ring");

    expect(emitAttunement).not.toHaveBeenCalled();
  });

  it("applies a remote attunement", () => {
    seed([item("inv_ring", "item_ring_of_protection", "ring_1")]);

    useCharacterSheetStore.getState().syncRemoteAttunement("inv_ring", true);

    expect(attunedOf("inv_ring")).toBe(true);
  });

  it("does not echo a remote change back onto the wire", () => {
    seed([item("inv_ring", "item_ring_of_protection", "ring_1")]);

    useCharacterSheetStore.getState().syncRemoteAttunement("inv_ring", true);

    expect(emitAttunement).not.toHaveBeenCalled();
  });

  it("re-checks the cap on a remote attunement from a stale client", () => {
    seed([
      { ...item("a", "item_ring_of_protection", "ring_1"), isAttuned: true },
      { ...item("b", "item_ring_of_protection", "ring_2"), isAttuned: true },
      { ...item("c", "item_ring_of_protection", "amulet"), isAttuned: true },
      item("d", "item_ring_of_protection", "cloak"),
    ]);

    useCharacterSheetStore.getState().syncRemoteAttunement("d", true);

    expect(attunedOf("d")).toBe(false);
  });

  it("consolidates when a remote break frees a carried row", () => {
    seed([
      item("inv_pile", "item_ring_of_protection"),
      { ...item("inv_ring", "item_ring_of_protection"), isAttuned: true },
    ]);

    useCharacterSheetStore.getState().syncRemoteAttunement("inv_ring", false);

    const inventory = useCharacterSheetStore.getState().inventory;
    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.quantity).toBe(2);
  });

  it("ignores a broadcast that changes nothing", () => {
    seed([item("inv_ring", "item_ring_of_protection", "ring_1")]);
    const before = useCharacterSheetStore.getState().inventory;

    useCharacterSheetStore.getState().syncRemoteAttunement("inv_ring", false);

    expect(useCharacterSheetStore.getState().inventory).toBe(before);
  });
});

describe("toInventoryInstance", () => {
  /**
   * Migration 0008 rewrote every stored "armor" and "ring" row, so these names
   * no longer reach the store and are not translated any more. A row still
   * carrying one is unrecognised data, and unrecognised data is carried rather
   * than trusted into a worn slot.
   */
  it.each(["armor", "ring"])(
    "no longer recognises the pre-migration slot %s",
    (slot) => {
      const migrated = toInventoryInstance({
        id: "inv_1",
        itemId: "item_armor_plate",
        quantity: 1,
        slot,
        isAttuned: true,
      });

      expect(migrated.slot).toBe("backpack");
      expect(migrated.isAttuned).toBe(true);
    },
  );

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
