import { create } from "zustand";

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

  // actions
  setStep: (step: number) => void;
  setName: (name: string) => void;
  setRace: (raceId: string, requiresSubrace: boolean) => void;
  setSubrace: (subraceId: string) => void;
  setClass: (classId: string, reqLevel: number) => void;
  setSubclass: (subclassId: string) => void;

  // validation gatekeeper
  canProceed: () => boolean;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 1,
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

      // TODO: Add more cases, Ability Scores, Backgrounds, etc...

      default:
        return false;
    }
  },
}));
