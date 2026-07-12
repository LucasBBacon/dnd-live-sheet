import {
  RestEngine,
  type Ability,
  type OperationalInventoryItem,
  type OperationalResource,
  type ProficiencyLevel,
  type TraitDefinition,
} from "@project/engine";
import type { RuleSnapshot, RuntimeModifier } from "@project/shared";
import { create } from "zustand";
import { socketService } from "../services/socketService";

const EQUIPMENT_SLOT_SET = new Set([
  "backpack",
  "main_hand",
  "off_hand",
  "armor",
  "head",
  "cloak",
  "ring_1",
  "ring_2",
  "amulet",
  "boots",
  "gloves",
]);

const inferItemTypeFromId = (
  itemId: string,
): "armor" | "weapon" | "consumable" | "gear" => {
  if (itemId.startsWith("item_weapon_")) return "weapon";
  if (itemId.startsWith("item_armor_")) return "armor";
  return "gear";
};

const isValidTargetSlotForItem = (
  itemId: string,
  itemType: "armor" | "weapon" | "consumable" | "gear",
  targetSlot: string,
): boolean => {
  if (!EQUIPMENT_SLOT_SET.has(targetSlot)) return false;
  if (targetSlot === "backpack") return true;

  if (itemType === "weapon") {
    return targetSlot === "main_hand" || targetSlot === "off_hand";
  }

  if (itemType === "armor") {
    if (itemId === "item_armor_shield") {
      return targetSlot === "off_hand";
    }
    return targetSlot === "armor";
  }

  return false;
};

export interface CharacterSheetState {
  id: string;
  campaignId: string | null;
  level: number;
  classLevels: Record<string, number>;
  raceId: string | null;
  subraceId: string | null;

  currentHp: number;
  maxHp: number;
  baseHpRolled: number;

  // base attributes (no items or buffs)
  baseScores: Record<Ability, number>;

  // skill and save proficiencies (mapped by id)
  proficiencies: Record<string, ProficiencyLevel>;

  traits: TraitDefinition[];
  traitGrants: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;

  // operational inventory
  inventory: OperationalInventoryItem[];
  inventoryError: string | null;

  // transient or spell based mods
  activeModifiers: RuntimeModifier[];

  resources: OperationalResource[];
  ruleSnapshot: Pick<RuleSnapshot, "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"> | null;

  // actions
  initialize: (payload: Partial<CharacterSheetState>) => void;

  applyHealthDelta: (delta: number, source: string) => void;
  syncRemoteHealthDelta: (delta: number) => void;

  equipItem: (inventoryId: string, targetSlot: string) => void;
  syncInventorySnapshot: (inventory: OperationalInventoryItem[]) => void;
  syncRemoteEquipment: (inventoryId: string, targetSlot: string) => void;
  consumeItem: (inventoryId: string, amount: number) => void;
  syncRemoteConsumption: (inventoryId: string, amount: number) => void;
  setInventoryError: (message: string | null) => void;

  consumeResource: (resourceId: string, amount?: number) => void;
  syncRemoteResource: (resourceId: string, amount: number) => void;

  triggerRest: (restType: "short" | "long") => void;

  toggleModifier: (modifierId: string, isActive: boolean) => void;
}

export const useCharacterSheetStore = create<CharacterSheetState>(
  (set, get) => ({
    id: "",
    campaignId: null,
    level: 1,
    classLevels: {},
    raceId: null,
    subraceId: null,
    currentHp: 10,
    maxHp: 10,
    baseHpRolled: 1,

    baseScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencies: {},
    traits: [],
    traitGrants: [],
    inventory: [],
    inventoryError: null,
    activeModifiers: [],
    resources: [],
    ruleSnapshot: null,

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
      const inventoryItem = state.inventory.find((item) => item.id === inventoryId);

      if (!inventoryItem) {
        return;
      }

      const itemType =
        state.ruleSnapshot?.itemsById?.[inventoryItem.itemId]?.type ??
        inferItemTypeFromId(inventoryItem.itemId);

      if (!isValidTargetSlotForItem(inventoryItem.itemId, itemType, targetSlot)) {
        return;
      }

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
      set({ inventory: updatedInventory, inventoryError: null });

      // dispatch to backend for persistence and broadcasting
      socketService.emitInventoryUpdate({
        characterId: state.id,
        inventoryId,
        targetSlot,
        timestamp: Date.now(),
      });
    },

    syncInventorySnapshot: (inventory) => {
      set({ inventory });
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

      set({ inventory: updatedInventory, inventoryError: null });

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

    setInventoryError: (message) => {
      set({ inventoryError: message });
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

    triggerRest: (restType: "short" | "long") => {
      const state = get();

      // sweep resources
      const updatedResources = RestEngine.applyRest(
        state.resources,
        restType,
        state.level,
        state.classLevels,
        state.ruleSnapshot ?? undefined,
      );
      // calc new HP
      const updatedHp = restType === "long" ? state.maxHp : state.currentHp;

      set({ resources: updatedResources, currentHp: updatedHp });

      socketService.emitRestCompleted({
        characterId: state.id,
        restType,
        timestamp: Date.now(),
      });
    },

    toggleModifier: (modId, isActive) =>
      set((state) => ({
        activeModifiers: state.activeModifiers.map((mod) =>
          mod.id === modId ? { ...mod, isActive } : mod,
        ),
      })),
  }),
);
