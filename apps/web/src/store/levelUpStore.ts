import type {
  ChoiceQuestion,
  ClassProgression,
  LevelDecision,
} from "@project/engine";
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
    // the server's full decision list (Task 3). Kept optional so a stubbed
    // or stale response falls back to mapServerDecisions below.
    decisions?: Array<LevelDecision>;
  } | null;
  // the questions this level newly asks, from the same before/after helper
  // the server's required check uses. Optional for a stubbed or stale
  // response, which then asks nothing.
  choiceQuestions?: ChoiceQuestion[];
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

/**
 * The server's full decision list (Task 3), with a subclass decision that
 * carries no options filled in from the response's own `subclasses` list -
 * mirrors what mapServerDecisions already does for the old decisionTypes
 * shape, so a subclass step always has something to pick from.
 */
const resolveDecisions = (
  decisions: LevelDecision[],
  subclasses: Array<{ id: string }>,
): LevelDecision[] =>
  decisions.map((decision) =>
    decision.type === "subclass" && !decision.options?.length
      ? { ...decision, options: subclasses.map((subclass) => subclass.id) }
      : decision,
  );

/** What the options request was made with, so it can be made again. */
type OptionsRequest = {
  characterId: string;
  classId: string;
  currentClassLevel: number;
  scope: ReferenceScope | undefined;
};

/**
 * The draft's answers, less any to a question the level no longer asks (a
 * subclass swapped for another) and any pick that is now held. Keyed by
 * question id in the map the question's target routes through.
 */
const pruneAnswers = (
  draft: Partial<LevelUpPayload>,
  questions: ChoiceQuestion[],
): Partial<LevelUpPayload> => {
  const prune = (
    answers: Record<string, string[]> | undefined,
    target: ChoiceQuestion["target"],
  ) => {
    if (!answers) return answers;
    const byId = new Map(
      questions
        .filter((question) => question.target === target)
        .map((question) => [question.id, question]),
    );
    return Object.fromEntries(
      Object.entries(answers)
        .filter(([id]) => byId.has(id))
        .map(([id, picks]) => [
          id,
          picks.filter((pick) => !byId.get(id)!.held.includes(pick)),
        ]),
    );
  };

  const selectedTraits = prune(draft.selectedTraits, "class");
  const traitSelections = prune(draft.traitSelections, "trait");
  return {
    ...draft,
    ...(selectedTraits ? { selectedTraits } : {}),
    ...(traitSelections ? { traitSelections } : {}),
  };
};

/** a blank select value means "none" */
const normaliseId = (value: string | undefined | null) => value || undefined;

// every options request gets a number; only the newest one's answer lands
let latestOptionsRequest = 0;

interface LevelUpState {
  isActive: boolean;
  progressionContext: ClassProgression | null;
  grantedTraitDetails: GrantedTraitDetail[];
  draftPayload: Partial<LevelUpPayload>;
  errorMessage: string | null;
  /** the questions this level newly asks, as the server sends them */
  choiceQuestions: ChoiceQuestion[];
  /** whether choiceQuestions matches the draft's current subclass and feat */
  questionsStatus: "ready" | "loading" | "error";
  optionsRequest: OptionsRequest | null;

  beginLevelUp: (
    characterId: string,
    classId: string,
    currentClassLevel: number,
    newTotalLevel: number,
    scope?: ReferenceScope,
    preResolvedSupport?: PreResolvedNextLevelSupport,
  ) => Promise<void>;
  updateDraft: (updates: Partial<LevelUpPayload>) => void;
  /**
   * Asks the server again for this level's questions, with the draft's
   * current subclassId and featId - both change what a level asks.
   */
  refreshChoiceQuestions: () => Promise<void>;
  validateAndSubmit: () => Promise<void>;
  cancelLevelUp: () => void;
}

export const useLevelUpStore = create<LevelUpState>((set, get) => ({
  isActive: false,
  progressionContext: null,
  grantedTraitDetails: [],
  draftPayload: {},
  errorMessage: null,
  choiceQuestions: [],
  questionsStatus: "ready",
  optionsRequest: null,

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

    const requestId = ++latestOptionsRequest;
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

      const { nextLevel, subclasses, choiceQuestions } =
        response as LevelUpOptionsResponse;

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
          decisions: nextLevel.decisions
            ? resolveDecisions(nextLevel.decisions, subclasses)
            : mapServerDecisions(nextLevel.decisionTypes, subclasses),
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
        choiceQuestions: choiceQuestions ?? [],
        // a refetch started meanwhile supersedes this answer's questions
        questionsStatus:
          requestId === latestOptionsRequest ? "ready" : get().questionsStatus,
        optionsRequest: { characterId, classId, currentClassLevel, scope },
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
    const previous = get().draftPayload;
    set((state) => ({ draftPayload: { ...state.draftPayload, ...updates } }));

    // a subclass or a feat changes what the level asks; nothing else does,
    // and an unchanged value asks nothing new - so no refetch loop
    const changes = (key: "subclassId" | "featId") =>
      key in updates && normaliseId(updates[key]) !== normaliseId(previous[key]);
    if (changes("subclassId") || changes("featId")) {
      void get().refreshChoiceQuestions();
    }
  },

  refreshChoiceQuestions: async () => {
    const { optionsRequest } = get();
    if (!optionsRequest) return;

    const requestId = ++latestOptionsRequest;
    const { draftPayload } = get();
    const subclassId = normaliseId(draftPayload.subclassId);
    const featId = normaliseId(draftPayload.featId);
    set({ questionsStatus: "loading" });

    try {
      const response = (await apiClient(
        buildLevelUpOptionsEndpoint(
          {
            campaignId: optionsRequest.scope?.campaignId,
            characterId: optionsRequest.characterId,
          },
          {
            classId: optionsRequest.classId,
            currentClassLevel: optionsRequest.currentClassLevel,
            subclassId,
            featId,
          },
        ),
      )) as LevelUpOptionsResponse;
      if (requestId !== latestOptionsRequest) return;

      const choiceQuestions = response.choiceQuestions ?? [];
      set((state) => ({
        choiceQuestions,
        questionsStatus: "ready",
        draftPayload: pruneAnswers(state.draftPayload, choiceQuestions),
        // the subclass's own decisions come with it; its picks, spells
        // included, arrive as choiceQuestions (#79)
        progressionContext:
          state.progressionContext && response.nextLevel?.decisions
            ? {
                ...state.progressionContext,
                decisions: resolveDecisions(
                  response.nextLevel.decisions,
                  response.subclasses,
                ),
              }
            : state.progressionContext,
      }));
    } catch {
      if (requestId !== latestOptionsRequest) return;
      set({ questionsStatus: "error" });
    }
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
      traitSelections,
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
      traitSelections,
    };

    await apiClient(`/character/${characterId}/level-up`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    set({
      isActive: false,
      progressionContext: null,
      grantedTraitDetails: [],
      draftPayload: {},
      errorMessage: null,
      choiceQuestions: [],
      questionsStatus: "ready",
      optionsRequest: null,
    });
  },

  cancelLevelUp: () => {
    set({
      isActive: false,
      progressionContext: null,
      grantedTraitDetails: [],
      draftPayload: {},
      errorMessage: null,
      choiceQuestions: [],
      questionsStatus: "ready",
      optionsRequest: null,
    });
  },
}));
