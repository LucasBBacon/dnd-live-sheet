import { create } from "zustand";

export type GenerationMethod = "STANDARD_ARRAY" | "POINT_BUY" | "MANUAL";
export type Attributes = "str" | "dex" | "con" | "int" | "wis" | "cha";

interface WizardState {
  currentStep: number;
  targetLevel: number;

  // draft data
  characterName: string;
  raceId: string | null;
  subraceId: string | null;
  classId: string | null;
  subclassId: string | null;

  raceRequiresSubrace: boolean;
  classSubclassReqLevel: number | null;

  generationMethod: GenerationMethod;
  baseAbilityScores: Record<Attributes, number>;

  // actions
  setStep: (step: number) => void;
  setName: (name: string) => void;
  setRace: (raceId: string, requiresSubrace: boolean) => void;
  setSubrace: (subraceId: string) => void;
  setClass: (classId: string, reqLevel: number) => void;
  setSubclass: (subclassId: string) => void;
  setGenerationMethod: (method: GenerationMethod) => void;
  setBaseAbilityScore: (stat: Attributes, value: number) => void;
  setAllAbilityScores: (scores: Record<Attributes, number>) => void;

  // validation gatekeeper
  canProceed: () => boolean;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 4,
  targetLevel: 1,

  characterName: "",
  raceId: null,
  subraceId: null,
  classId: null,
  subclassId: null,

  raceRequiresSubrace: false,
  classSubclassReqLevel: null,

  setStep: (step) => set({ currentStep: step }),

  setName: (name) => set({ characterName: name }),

  setRace: (raceId, requiresSubrace) =>
    set({
      raceId,
      raceRequiresSubrace: requiresSubrace,
      // wipe subrace if change their mind so it's not saved
      subraceId: null,
    }),

  setSubrace: (subraceId) => set({ subraceId }),

  setClass: (classId, reqLevel) =>
    set({
      classId,
      classSubclassReqLevel: reqLevel,
      subclassId: null,
    }),

  setSubclass: (subclassId) => set({ subclassId }),

  generationMethod: "STANDARD_ARRAY",
  baseAbilityScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },

  setGenerationMethod: (method) =>
    set({
      generationMethod: method,
      // reset ot baseline when switching methods!!
      baseAbilityScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    }),

  setBaseAbilityScore: (stat, value) =>
    set((state) => ({
      baseAbilityScores: { ...state.baseAbilityScores, [stat]: value },
    })),

  setAllAbilityScores: (scores) => set({ baseAbilityScores: scores }),

  canProceed: () => {
    const state = get();

    switch (state.currentStep) {
      case 1: // name and basics
        return state.characterName.trim().length > 0;

      case 2: // race selection
        if (!state.raceId) return false;
        // Strict Enforcement: Block UI progression if subrace is required but missing
        // This requirement logic relies on data fetched from reference API
        if (state.raceRequiresSubrace && !state.subraceId) return false;
        return true;

      case 3: // class selection
        if (!state.classId) return false;
        if (
          state.classSubclassReqLevel &&
          state.targetLevel >= state.classSubclassReqLevel
        ) {
          if (!state.subclassId) return false;
        }
        return true;

      case 4:
        // ensure all ability scores are within valid phb bounds (3-18 pre racial)
        return Object.values(state.baseAbilityScores).every(
          (val) => val >= 3 && val <= 18,
        );

      // TODO: Add more cases, Ability Scores, Backgrounds, etc...

      default:
        return false;
    }
  },
}));
