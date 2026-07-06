import { ProgressionEngine, type ClassProgression } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { create } from "zustand";

interface LevelUpState {
  isActive: boolean;
  progressionContext: ClassProgression | null;
  draftPayload: Partial<LevelUpPayload>;

  beginLevelUp: (
    characterId: string,
    classId: string,
    currentClassLevel: number,
    newTotalLevel: number,
  ) => void;
  updateDraft: (updates: Partial<LevelUpPayload>) => void;
  validateAndSubmit: () => Promise<void>;
  cancelLevelUp: () => void;
}

export const useLevelUpStore = create<LevelUpState>((set, get) => ({
  isActive: false,
  progressionContext: null,
  draftPayload: {},

  beginLevelUp: (characterId, classId, currentClassLevel, newTotalLevel) => {
    // 1 - fetch required decisions for the next level from engine
    const nextLevelDef = ProgressionEngine.getLevelDefinition(
      classId,
      currentClassLevel + 1,
    );

    set({
      isActive: true,
      progressionContext: nextLevelDef,
      draftPayload: {
        characterId,
        targetClassId: classId,
        newTotalLevel,
      },
    });
  },

  updateDraft: (updates) => {
    set((state) => ({ draftPayload: { ...state.draftPayload, ...updates } }));
  },

  validateAndSubmit: async () => {
    const { draftPayload, progressionContext } = get();

    // STRICT VALIDATION - ensure subclass is selected if progression demands it
    const requiresSubclass = progressionContext?.decisions.some(
      (d) => d.type === "subclass",
    );
    if (requiresSubclass && !draftPayload.subclassId) {
      throw new Error("Subclass selection is strictly required to proceed.");
    }

    // TODO: Execute API submission
  },

  cancelLevelUp: () => {
    set({ isActive: false, progressionContext: null, draftPayload: {} });
  },
}));
