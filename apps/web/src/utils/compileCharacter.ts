import type { WizardState } from "../store/wizardStore";
import type { CreateCharacterPayload } from "@project/shared";

export const compileCharacterPayload = (
  state: WizardState,
): CreateCharacterPayload => {
  return {
    name: state.characterName.trim(),
    raceId: state.raceId!,
    subraceId: state.subraceId,
    classId: state.classId!,
    subclassId: state.subclassId,
    baseAbilityScores: state.baseAbilityScores,
    alignment: state.alignment.trim(),
    background: {
      type: state.backgroundType!,
      presetId: state.backgroundType === "PRESET" ? state.backgroundId : null,
      customData:
        state.backgroundType === "CUSTOM" ? state.customBackground : null,
    },
    personality: state.personality,
  };
};
