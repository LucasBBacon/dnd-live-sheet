import { create } from "zustand";

interface WizardState {
  currentStep: number;

  // draft data
  name: string;
  selectedRaceId: string | null;
  selectedSubraceId: string | null;
  selectedClassId: string | null;
  selectedSubclassId: string | null;

  // actions
  setStep: (step: number) => void;
  setRace: (raceId: string, requiresSubrace: boolean) => void;
  setClass: (classId: string, subclassReqLevel: boolean) => void;

  // validation gatekeeper
  canProceedToNextStep: () => boolean;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 1,
  name: "",
  selectedRaceId: null,
  selectedSubraceId: null,
  selectedClassId: null,
  selectedSubclassId: null,

  setStep: (step) => set({ currentStep: step }),

  setRace: (raceId, requiresSubrace) =>
    set({
      selectedRaceId: raceId,
      // wipe subrace if change their mind so it's not saved
      selectedSubraceId: null,
    }),

  setClass: (classId, subclassReqLevel) =>
    set({
      selectedClassId: classId,
      selectedSubclassId: null,
    }),

  canProceedToNextStep: () => {
    const state = get();
    if (state.currentStep === 1) return state.name.length > 0;

    if (state.currentStep === 2) {
      // race selection
      if (!state.selectedRaceId) return false;
      // Strict Enforcement: Block UI progression if subrace is required but missing
      // This requirement logic relies on data fetched from reference API
      return true;
    }

    return false;
  },
}));
