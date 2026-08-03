import {
  CARRIED_SLOT,
  RestEngine,
  canEquipTo,
  resolveEquipmentDefinition,
  resolveItemDefinition,
  slotsConsumedBy,
  type Ability,
  type OperationalResource,
  type ProficiencyLevel,
  type TraitDefinition,
} from "@project/engine";
import {
  CharacterSlotSchema,
  type CharacterSlot,
  type InventoryInstance,
  type RuleSnapshot,
  type RuntimeModifier,
} from "@project/shared";
import { create } from "zustand";
import { socketService } from "../services/socketService";

const isKnownSlot = (slot: string): slot is CharacterSlot =>
  CharacterSlotSchema.safeParse(slot).success;

/**
 * Slot names that existed before the body/ring model. Persisted rows still
 * carry them, so they are translated on the way in rather than with a
 * migration that would break any client still on the old build.
 */
const LEGACY_SLOT_ALIASES: Record<string, CharacterSlot> = {
  armor: "body", // collided with the *type* value "armor"
  ring: "ring_1", // a single ring slot became two
};

/**
 * Normalizes an inventory row arriving from the API or a socket broadcast.
 * The wire types slot as a bare string, so an unrecognised value degrades to
 * carried rather than corrupting the worn state.
 */
export const toInventoryInstance = (item: {
  id: string;
  itemId: string;
  quantity: number;
  slot: string;
  isAttuned: boolean;
  customName?: string;
}): InventoryInstance => {
  const aliased = LEGACY_SLOT_ALIASES[item.slot] ?? item.slot;

  return {
    id: item.id,
    itemId: item.itemId,
    quantity: item.quantity,
    slot: isKnownSlot(aliased) ? aliased : CARRIED_SLOT,
    isAttuned: item.isAttuned,
    ...(item.customName !== undefined && { customName: item.customName }),
  };
};

type SheetRuleSnapshot = Pick<
  RuleSnapshot,
  "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
>;

/**
 * Every character slot an item actually covers where it currently sits.
 * A two-handed weapon in the main hand also covers the off hand, so a shield
 * cannot slide in beside it.
 */
const occupiedSlots = (
  item: InventoryInstance,
  snapshot: SheetRuleSnapshot | null,
): CharacterSlot[] => {
  if (item.slot === CARRIED_SLOT) return [];

  const equipment = resolveEquipmentDefinition(item.itemId, snapshot ?? undefined);

  return equipment ? slotsConsumedBy(equipment, item.slot) : [item.slot];
};

/**
 * Moves an item into a slot, evicting whatever it collides with.
 *
 * Slot legality comes from the item's authored equipSlot via the engine, so
 * nothing here has to guess an item's kind from its id or special-case a
 * shield. Returns null when the move is illegal, leaving state untouched.
 */
const placeItem = (
  inventory: InventoryInstance[],
  inventoryId: string,
  targetSlot: string,
  snapshot: SheetRuleSnapshot | null,
): InventoryInstance[] | null => {
  if (!isKnownSlot(targetSlot)) return null;

  const moving = inventory.find((item) => item.id === inventoryId);
  if (!moving) return null;

  const definition = resolveItemDefinition(moving.itemId, snapshot ?? undefined);
  if (!definition || !canEquipTo(definition, targetSlot)) return null;

  const equipment = resolveEquipmentDefinition(moving.itemId, snapshot ?? undefined);
  const incoming = new Set(
    equipment ? slotsConsumedBy(equipment, targetSlot) : [targetSlot],
  );

  return inventory.map((item) => {
    if (item.id === inventoryId) return { ...item, slot: targetSlot };

    // evict any item whose own footprint overlaps the incoming one's.
    // attunement survives: the item is still carried, just not worn
    const collides = occupiedSlots(item, snapshot).some((slot) =>
      incoming.has(slot),
    );

    return collides ? { ...item, slot: CARRIED_SLOT } : item;
  });
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
  inventory: InventoryInstance[];
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
  // takes the wire shape: slot arrives as an unvalidated string
  syncInventorySnapshot: (
    inventory: Array<Parameters<typeof toInventoryInstance>[0]>,
  ) => void;
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

    baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
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

      // optimistically resolve slot contention locally
      const updatedInventory = placeItem(
        state.inventory,
        inventoryId,
        targetSlot,
        state.ruleSnapshot,
      );

      if (!updatedInventory) {
        return;
      }

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
      set({ inventory: inventory.map(toInventoryInstance) });
    },

    syncRemoteEquipment: (inventoryId, targetSlot) => {
      const state = get();

      // a broadcast carries an unvalidated slot string, so it goes through the
      // same legality check as a local move rather than being trusted
      const updatedInventory = placeItem(
        state.inventory,
        inventoryId,
        targetSlot,
        state.ruleSnapshot,
      );

      if (!updatedInventory) {
        return;
      }

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
