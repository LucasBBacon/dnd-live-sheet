import type { ClassProgression, LevelDecision } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { create } from "zustand";
import {
  apiClient,
  buildLevelUpOptionsEndpoint,
  type ReferenceScope,
} from "../api/client";

type LevelUpOptionsResponse = {
  subclasses: Array<{ id: string }>;
  nextLevel: {
    targetLevel: number;
    isConfigured: boolean;
    reason: string | null;
    grantedTraitIds: string[];
    grantedTraits?: Array<{
      id: string;
      name: string;
      grantSourceType:
        | "multiclass_grant"
        | "class_progression"
        | "subclass_progression";
    }>;
    decisionTypes: Array<"subclass" | "asi_or_feat">;
  } | null;
};

export type GrantedTraitDetail = {
  id: string;
  name: string;
  grantSourceType:
    | "multiclass_grant"
    | "class_progression"
    | "subclass_progression";
};

export type PreResolvedNextLevelSupport = {
  targetLevel: number;
  isConfigured: boolean;
  reason: string | null;
};

const mapServerDecisions = (
  decisionTypes: Array<"subclass" | "asi_or_feat">,
  subclasses: Array<{ id: string }>,
): LevelDecision[] =>
  decisionTypes.map((type): LevelDecision => {
    if (type === "subclass") {
      return {
        id: "dec_server_subclass",
        type: "subclass",
        description: "Choose a subclass for this class level.",
        options: subclasses.map((subclass) => subclass.id),
        isRequired: true,
        quantity: 1,
      };
    }

    return {
      id: "dec_server_asi_or_feat",
      type: "asi_or_feat",
      description: "Increase one ability score by 2, or two by 1, or choose a feat.",
      isRequired: true,
      quantity: 1,
    };
  });

interface LevelUpState {
  isActive: boolean;
  progressionContext: ClassProgression | null;
  grantedTraitDetails: GrantedTraitDetail[];
  draftPayload: Partial<LevelUpPayload>;
  errorMessage: string | null;

  beginLevelUp: (
    characterId: string,
    classId: string,
    currentClassLevel: number,
    newTotalLevel: number,
    scope?: ReferenceScope,
    preResolvedSupport?: PreResolvedNextLevelSupport,
  ) => Promise<void>;
  updateDraft: (updates: Partial<LevelUpPayload>) => void;
  validateAndSubmit: () => Promise<void>;
  cancelLevelUp: () => void;
}

export const useLevelUpStore = create<LevelUpState>((set, get) => ({
  isActive: false,
  progressionContext: null,
  grantedTraitDetails: [],
  draftPayload: {},
  errorMessage: null,

  beginLevelUp: async (
    characterId,
    classId,
    currentClassLevel,
    newTotalLevel,
    scope,
    preResolvedSupport,
  ) => {
    if (preResolvedSupport && !preResolvedSupport.isConfigured) {
      set((state) => ({
        isActive: state.isActive,
        progressionContext: state.progressionContext,
        draftPayload: state.draftPayload,
        errorMessage:
          preResolvedSupport.reason ||
          `Level-up progression for ${classId} level ${preResolvedSupport.targetLevel} is not configured yet.`,
      }));
      return;
    }

    try {
      const response = await apiClient(
        buildLevelUpOptionsEndpoint(
          {
            campaignId: scope?.campaignId,
            characterId,
          },
          {
            classId,
            currentClassLevel,
          },
        ),
      );

      const { nextLevel, subclasses } = response as LevelUpOptionsResponse;

      if (!nextLevel || !nextLevel.isConfigured) {
        set((state) => ({
          isActive: state.isActive,
          progressionContext: state.progressionContext,
          draftPayload: state.draftPayload,
          errorMessage:
            nextLevel?.reason ||
            `Level-up progression for ${classId} level ${currentClassLevel + 1} is not configured yet.`,
        }));
        return;
      }

      set({
        isActive: true,
        progressionContext: {
          classId,
          level: nextLevel.targetLevel,
          grantedTraits: nextLevel.grantedTraitIds,
          decisions: mapServerDecisions(nextLevel.decisionTypes, subclasses),
        },
        grantedTraitDetails:
          nextLevel.grantedTraits ??
          nextLevel.grantedTraitIds.map((traitId) => ({
            id: traitId,
            name: traitId.replace(/_/g, " ").toUpperCase(),
            grantSourceType: "class_progression" as const,
          })),
        draftPayload: {
          characterId,
          targetClassId: classId,
          newTotalLevel,
        },
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to resolve level-up progression from server.";

      set((state) => ({
        isActive: state.isActive,
        progressionContext: state.progressionContext,
        draftPayload: state.draftPayload,
        errorMessage: message,
      }));
    }
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
      grantedTraitDetails: [],
      draftPayload: {},
      errorMessage: null,
    });
  },
}));
