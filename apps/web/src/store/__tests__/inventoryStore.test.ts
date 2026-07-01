import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInventoryStore } from "../inventoryStore";

describe("inventoryStore", () => {
  beforeEach(() => {
    useInventoryStore.setState({
      items: [],
      searchQuery: "",
      strengthScore: 10,
    });
    vi.restoreAllMocks();
  });

  it("adds a new item to inventory", () => {
    useInventoryStore.getState().addItem({
      id: "item_rope",
      name: "Rope",
      description: "50ft hempen rope",
      weight: 10,
      quantity: 1,
    });

    expect(useInventoryStore.getState().items).toEqual([
      {
        id: "item_rope",
        name: "Rope",
        description: "50ft hempen rope",
        weight: 10,
        quantity: 1,
      },
    ]);
  });

  it("merges quantity when adding duplicate item id", () => {
    const store = useInventoryStore.getState();
    store.addItem({
      id: "item_torch",
      name: "Torch",
      description: "A wooden torch",
      weight: 1,
      quantity: 2,
    });
    store.addItem({
      id: "item_torch",
      name: "Torch",
      description: "A wooden torch",
      weight: 1,
      quantity: 3,
    });

    expect(useInventoryStore.getState().items).toHaveLength(1);
    expect(useInventoryStore.getState().items[0].quantity).toBe(5);
  });

  it("blocks additions that exceed carrying capacity", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    useInventoryStore.setState({ strengthScore: 1 });
    useInventoryStore.getState().addItem({
      id: "item_anvil",
      name: "Anvil",
      description: "Very heavy",
      weight: 20,
      quantity: 1,
    });

    expect(useInventoryStore.getState().items).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Encumbrance limit exceeded. Transaction blocked.",
    );
  });

  it("updates search query", () => {
    useInventoryStore.getState().setSearchQuery("rope");
    expect(useInventoryStore.getState().searchQuery).toBe("rope");
  });
});
