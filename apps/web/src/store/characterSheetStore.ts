import type {
  Ability,
  CharacterResource,
  Modifier,
  OperationalInventoryItem,
  ProficiencyLevel,
} from "@project/engine";
import { create } from "zustand";
import { socketService } from "../services/socketService";

export interface CharacterSheetState {
  id: string;
  level: number;

  currentHp: number;
  maxHp: number;

  // base attributes (no items or buffs)
  baseScores: Record<Ability, number>;

  // skill and save proficiencies (mapped by id)
  proficiencies: Record<string, ProficiencyLevel>;

  // operational inventory
  inventory: OperationalInventoryItem[];

  // transient or spell based mods
  activeModifiers: Modifier[];

  resources: CharacterResource[];

  // actions
  initialize: (payload: Partial<CharacterSheetState>) => void;

  applyHealthDelta: (delta: number, source: string) => void;
  syncRemoteHealthDelta: (delta: number) => void;

  equipItem: (inventoryId: string, targetSlot: string) => void;
  syncRemoteEquipment: (inventoryId: string, targetSlot: string) => void;
  consumeItem: (inventoryId: string, amount: number) => void;
  syncRemoteConsumption: (inventoryId: string, amount: number) => void;

  consumeResource: (resourceId: string, amount?: number) => void;
  syncRemoteResource: (resourceId: string, amount: number) => void;

  toggleModifier: (modifierId: string, isActive: boolean) => void;
}

export const useCharacterSheetStore = create<CharacterSheetState>(
  (set, get) => ({
    id: "",
    level: 1,
    currentHp: 10,
    maxHp: 10,

    baseScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencies: {},
    inventory: [],
    activeModifiers: [],
    resources: [],

    initialize: (payload) => set((state) => ({ ...state, ...payload })),

    applyHealthDelta: (delta, source) => {
      const state = get();

      // calculate new hp, clamping
      const newHp = Math.min(Math.max(0, state.currentHp + delta), state.maxHp);

      // update local state instantly
      set({ currentHp: newHp });

      // fire and forget network req
      socketService.emitHpModification({
        characterId: state.id,
        delta,
        source,
        timestamp: Date.now(),
      });
    },

    syncRemoteHealthDelta: (delta) => {
      const state = get();
      const newHp = Math.min(Math.max(0, state.currentHp + delta), state.maxHp);
      set({ currentHp: newHp });
    },

    equipItem: (inventoryId, targetSlot) => {
      const state = get();

      // optimistically resolve slot contention locally
      const updatedInventory = state.inventory.map((item) => {
        // if another item is in the target slot, unequip it
        if (item.slot === targetSlot && targetSlot !== "backpack") {
          return { ...item, slot: "backpack" };
        }
        // equip target item
        if (item.id === inventoryId) {
          return { ...item, slot: targetSlot };
        }
        return item;
      });

      // update local state instantly 0-latency
      set({ inventory: updatedInventory });

      // dispatch to backend for persistence and broadcasting
      socketService.emitInventoryUpdate({
        characterId: state.id,
        inventoryId,
        targetSlot,
        timestamp: Date.now(),
      });
    },

    syncRemoteEquipment: (inventoryId, targetSlot) => {
      const state = get();
      const updatedInventory = state.inventory.map((item) => {
        if (item.slot === targetSlot && targetSlot !== "backpack") {
          return { ...item, slot: "backpack" };
        }
        if (item.id === inventoryId) {
          return { ...item, slot: targetSlot };
        }
        return item;
      });
      set({ inventory: updatedInventory });
    },

    consumeItem: (inventoryId, amount = 1) => {
      const state = get();

      // find the item and ensure it exists
      const targetItem = state.inventory.find((i) => i.id === inventoryId);
      if (!targetItem) return;

      // optimistically update the array
      const updatedInventory = state.inventory
        .map((item) => {
          if (item.id === inventoryId) {
            return { ...item, quantity: item.quantity - amount };
          }
          return item;
        })
        .filter((item) => item.quantity > 0); // strip it out if it hits 0

      set({ inventory: updatedInventory });

      socketService.emitInventoryConsumed({
        characterId: state.id,
        inventoryId,
        amount,
        timestamp: Date.now(),
      });
    },

    syncRemoteConsumption: (inventoryId, amount) => {
      const state = get();
      const updatedInventory = state.inventory
        .map((item) =>
          item.id === inventoryId
            ? { ...item, quantity: item.quantity - amount }
            : item,
        )
        .filter((item) => item.quantity > 0);

      set({ inventory: updatedInventory });
    },

    consumeResource: (resourceId, amount = 1) => {
      const state = get();

      const targetResource = state.resources.find((r) => r.id === resourceId);
      if (!targetResource || targetResource.current < amount) return;

      // optimistically decrement, clamp 0
      const updatedResources = state.resources.map((res) => {
        if (res.id === resourceId) {
          return { ...res, current: Math.max(0, res.current - amount) };
        }
        return res;
      });

      set({ resources: updatedResources });

      // fire network transaction
      socketService.emitResourceConsumed({
        characterId: state.id,
        resourceId,
        amount,
        timestamp: Date.now(),
      });
    },

    syncRemoteResource: (resourceId, amount) => {
      const state = get();
      const updatedResources = state.resources.map((res) => {
        if (res.id === resourceId) {
          return { ...res, current: Math.max(0, res.current - amount) };
        }
        return res;
      });
      set({ resources: updatedResources });
    },

    toggleModifier: (modId, isActive) =>
      set((state) => ({
        activeModifiers: state.activeModifiers.map((mod) =>
          mod.id === modId ? { ...mod, isActive } : mod,
        ),
      })),
  }),
);
