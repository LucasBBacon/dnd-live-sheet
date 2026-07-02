import type {
  Ability,
  Modifier,
  OperationalInventoryItem,
  ProficiencyLevel,
} from "@project/engine";
import { create } from "zustand";

export interface CharacterSheetState {
  id: string;
  level: number;

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
  equipItem: (inventoryId: string, targetSlot: string) => void;
  toggleModifier: (modifierId: string, isActive: boolean) => void;
}

export const useCharacterSheetStore = create<CharacterSheetState>((set) => ({
  id: "",
  level: 1,
  baseScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  proficiencies: {},
  inventory: [],
  activeModifiers: [],

  initialize: (payload) => set((state) => ({ ...state, ...payload })),

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
}));
