import type {
  Ability,
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

  // actions
  initialize: (payload: Partial<CharacterSheetState>) => void;

  applyHealthDelta: (delta: number, source: string) => void;
  syncRemoteHealthDelta: (delta: number) => void;

  equipItem: (inventoryId: string, targetSlot: string) => void;
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

    equipItem: (inventoryId, targetSlot) =>
      set((state) => ({
        inventory: state.inventory.map((item) =>
          item.id === inventoryId ? { ...item, slot: targetSlot } : item,
        ),
      })),

    toggleModifier: (modId, isActive) =>
      set((state) => ({
        activeModifiers: state.activeModifiers.map((mod) =>
          mod.id === modId ? { ...mod, isActive } : mod,
        ),
      })),
  }),
);
