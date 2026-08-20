import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useRollStore } from "../store/rollStore";

export interface CheckRollRequest {
  /** What is being rolled, for the prompt and the roll log. */
  label: string;
  modifier: number;
  target: "ABILITY_CHECK" | "SAVING_THROW";
}

const signed = (value: number): string =>
  value >= 0 ? `+${value}` : `${value}`;

/**
 * Rolls a skill check or a saving throw and files the result.
 *
 * The die is asked for rather than pre-rolled: the roll interceptor lets the
 * player roll digitally or type what their physical dice showed, which is the
 * whole point of a sheet that sits beside a real table. Only the modifier is
 * the sheet's business.
 *
 * A cancelled roll records nothing - closing the prompt is a change of mind,
 * not a roll of zero.
 */
export const useCheckRoll = () => {
  const requestRoll = useRollStore((state) => state.requestRoll);
  const recordRollResult = useCharacterSheetStore(
    (state) => state.recordRollResult,
  );
  const characterId = useCharacterSheetStore((state) => state.id);

  return async ({ label, modifier, target }: CheckRollRequest) => {
    let rolled: number;

    try {
      rolled = await requestRoll("1d20", `Roll ${label} (${signed(modifier)})`, {
        targetLabel: label,
      });
    } catch {
      return;
    }

    recordRollResult({
      characterId,
      rollResults: [
        {
          total: rolled + modifier,
          rolls: [rolled],
          modifier,
          target,
          label,
        },
      ],
      timestamp: Date.now(),
    });
  };
};
