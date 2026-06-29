import { create } from "zustand";

export type GenerationMethod = "STANDARD_ARRAY" | "POINT_BUY" | "MANUAL";
export type Attributes = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface WizardEquipmentChoice {
  itemId: string;
  quantity: number;
}

export interface WizardState {
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

  alignment: string;
  backgroundType: "PRESET" | "CUSTOM" | null;
  backgroundId: string | null;

  customBackground: {
    name: string;
    featureName: string;
    featureDescription: string;
    skillTraitIds: string[]; // strict limit of 2
    toolLanguageTraitIds: string[]; // strict limit of 2
  };

  personality: {
    traits: string;
    ideals: string;
    bonds: string;
    flaws: string;
  };

  selectedClassEquipmentChoices: Record<number, WizardEquipmentChoice[]>;
  requiredEquipmentChoiceCount: number;

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

  setAlignment: (alignment: string) => void;
  setBackgroundMode: (mode: "PRESET" | "CUSTOM") => void;
  setPresetBackground: (id: string) => void;
  updateCustomBackground: (
    updates: Partial<WizardState["customBackground"]>,
  ) => void;
  updatePersonality: (
    field: keyof WizardState["personality"],
    value: string,
  ) => void;

  setClassEquipmentChoice: (
    groupIndex: number,
    bundleItems: WizardEquipmentChoice[],
  ) => void;
  setRequiredEquipmentChoiceCount: (count: number) => void;

  // validation gatekeeper
  canProceed: () => boolean;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 3,
  targetLevel: 1,

  characterName: "",
  raceId: null,
  subraceId: null,
  classId: null,
  subclassId: null,

  raceRequiresSubrace: false,
  classSubclassReqLevel: null,

  alignment: "",
  backgroundType: null,
  backgroundId: null,

  customBackground: {
    name: "",
    featureName: "",
    featureDescription: "",
    skillTraitIds: [],
    toolLanguageTraitIds: [],
  },

  personality: {
    traits: "",
    ideals: "",
    bonds: "",
    flaws: "",
  },

  selectedClassEquipmentChoices: {},
  requiredEquipmentChoiceCount: 0,

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
      selectedClassEquipmentChoices: {},
      requiredEquipmentChoiceCount: 0,
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

  setAlignment: (alignment) => set({ alignment }),

  setBackgroundMode: (mode) =>
    set({
      backgroundType: mode,
      // wipe specific selections when toggling
      backgroundId: null,
      customBackground: {
        name: "",
        featureName: "",
        featureDescription: "",
        skillTraitIds: [],
        toolLanguageTraitIds: [],
      },
    }),

  setPresetBackground: (id) => set({ backgroundId: id }),

  updateCustomBackground: (updates) =>
    set((state) => ({
      customBackground: { ...state.customBackground, ...updates },
    })),

  updatePersonality: (field, value) =>
    set((state) => ({
      personality: { ...state.personality, [field]: value },
    })),

  setClassEquipmentChoice: (groupIndex, bundleItems) =>
    set((state) => ({
      selectedClassEquipmentChoices: {
        ...state.selectedClassEquipmentChoices,
        [groupIndex]: bundleItems,
      },
    })),
  setRequiredEquipmentChoiceCount: (count) =>
    set({ requiredEquipmentChoiceCount: count }),

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

        // subclass gatekeeper
        if (
          state.classSubclassReqLevel &&
          state.targetLevel >= state.classSubclassReqLevel
        ) {
          if (!state.subclassId) return false;
        }

        // strict equipment gatekeeper
        if (
          Object.keys(state.selectedClassEquipmentChoices).length <
          state.requiredEquipmentChoiceCount
        )
          return false;

        return true;

      case 4: // ability score
        // ensure all ability scores are within valid phb bounds (3-18 pre racial)
        return Object.values(state.baseAbilityScores).every(
          (val) => val >= 3 && val <= 18,
        );

      case 5: // identity and background
        if (state.alignment.trim().length === 0) return false;
        if (!state.backgroundType) return false;

        if (state.backgroundType === "PRESET" && !state.backgroundId)
          return false;
        if (state.backgroundType === "CUSTOM") {
          const cb = state.customBackground;
          if (!cb.name || !cb.featureName || !cb.featureDescription)
            return false;
          if (cb.skillTraitIds.length !== 2) return false;
        }
        return true;

      default:
        return false;
    }
  },
}));
