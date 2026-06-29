import { create } from "zustand";

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  weight: number;
  quantity: number;
}

interface InventoryState {
  items: InventoryItem[];
  searchQuery: string;
  strengthScore: number; // injected from character state

  setSearchQuery: (query: string) => void;
  addItem: (item: InventoryItem) => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  searchQuery: "",
  strengthScore: 10,

  setSearchQuery: (query) => set({ searchQuery: query }),

  addItem: (newItem) => {
    const state = get();
    const capacity = state.strengthScore * 15; // 5e standard carrying capacity
    const currentWeight = state.items.reduce(
      (acc, curr) => acc + curr.weight * curr.quantity,
      0,
    );
    const addedWeight = newItem.weight * newItem.quantity;

    if (currentWeight + addedWeight > capacity) {
      console.warn("Encumbrance limit exceeded. Transaction blocked.");
      return; // reject addition TODO: Check rules for item addition
    }

    set((state) => {
      const existing = state.items.find((i) => i.id === newItem.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === newItem.id
              ? { ...i, quantity: i.quantity + newItem.quantity }
              : i,
          ),
        };
      }
      return { items: [...state.items, newItem] };
    });
  },
}));

// high performance derived selector for UI rendering
export const useFilteredInventory = () => {
  return useInventoryStore((state) => {
    if (!state.searchQuery) return state.items;

    const lowerQuery = state.searchQuery.toLowerCase();
    return state.items.filter(
      (item) =>
        item.name.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery),
    );
  });
};
