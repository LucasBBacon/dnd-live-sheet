import { ProgressionEngine, type ClassProgression } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { create } from "zustand";
import { apiClient } from "../api/client";

interface LevelUpState {
  isActive: boolean;
  progressionContext: ClassProgression | null;
  draftPayload: Partial<LevelUpPayload>;
  errorMessage: string | null;

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
  errorMessage: null,

  beginLevelUp: (characterId, classId, currentClassLevel, newTotalLevel) => {
    // 1 - fetch required decisions for the next level from engine
    const nextLevelDef = ProgressionEngine.getLevelDefinition(
      classId,
      currentClassLevel + 1,
    );

    if (!nextLevelDef) {
      set((state) => ({
        isActive: state.isActive,
        progressionContext: state.progressionContext,
        draftPayload: state.draftPayload,
        errorMessage: `Level-up progression for ${classId} level ${currentClassLevel + 1} is not configured yet.`,
      }));
      return;
    }

    set({
      isActive: true,
      progressionContext: nextLevelDef,
      draftPayload: {
        characterId,
        targetClassId: classId,
        newTotalLevel,
      },
      errorMessage: null,
    });
  },

  updateDraft: (updates) => {
    set((state) => ({ draftPayload: { ...state.draftPayload, ...updates } }));
  },

  validateAndSubmit: async () => {
    const { draftPayload, progressionContext, errorMessage } = get();

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    // STRICT VALIDATION - ensure subclass is selected if progression demands it
    const requiresSubclass = progressionContext?.decisions.some(
      (d) => d.type === "subclass",
    );
    if (requiresSubclass && !draftPayload.subclassId) {
      throw new Error("Subclass selection is strictly required to proceed.");
    }

    const {
      characterId,
      targetClassId,
      newTotalLevel,
      hpRoll,
      subclassId,
      asiChoices,
      featId,
      selectedTraits,
      addedSpells,
      replacedSpells,
    } = draftPayload;

    if (!characterId || !targetClassId || !newTotalLevel || !hpRoll) {
      throw new Error("Level-up payload is incomplete.");
    }

    const payload: LevelUpPayload = {
      characterId,
      targetClassId,
      newTotalLevel,
      hpRoll,
      subclassId,
      asiChoices,
      featId,
      selectedTraits,
      addedSpells,
      replacedSpells,
    };

    await apiClient(`/character/${characterId}/level-up`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  cancelLevelUp: () => {
    set({
      isActive: false,
      progressionContext: null,
      draftPayload: {},
      errorMessage: null,
    });
  },
}));
