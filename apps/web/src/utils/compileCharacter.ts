import type { WizardState } from "../store/wizardStore";
import type { CreateCharacterPayload, StartingEquipmentGrant } from "@project/shared";

export const compileCharacterPayload = (
  state: WizardState,
): CreateCharacterPayload => {
  const selectedClassEquipment = Object.values(
    state.selectedClassEquipmentChoices,
  ).flat() as StartingEquipmentGrant[];

  const compiledEquipment = [
    ...state.classStartingEquipment.given,
    ...selectedClassEquipment,
    ...(state.backgroundType === "PRESET"
      ? state.presetBackgroundStartingEquipment.given
      : []),
  ];

  return {
    campaignId: state.campaignId ?? undefined,
    name: state.characterName.trim(),
    raceId: state.raceId!,
    subraceId: state.subraceId,
    classId: state.classId!,
    subclassId: state.subclassId,
    // wizard state is keyed by the engine's uppercase Ability type; the create
    // payload contract is the flat lowercase column names.
    baseAbilityScores: {
      str: state.baseAbilityScores.STR,
      dex: state.baseAbilityScores.DEX,
      con: state.baseAbilityScores.CON,
      int: state.baseAbilityScores.INT,
      wis: state.baseAbilityScores.WIS,
      cha: state.baseAbilityScores.CHA,
    },
    alignment: state.alignment.trim(),
    background: {
      type: state.backgroundType!,
      presetId: state.backgroundType === "PRESET" ? state.backgroundId : null,
      customData:
        state.backgroundType === "CUSTOM" ? state.customBackground : null,
    },
    personality: state.personality,
    startingEquipment: {
      given: compiledEquipment.map((grant) => ({
        kind: grant.kind,
        refId: grant.refId,
        quantity: grant.quantity,
      })),
      choices: [],
    },
  };
};
