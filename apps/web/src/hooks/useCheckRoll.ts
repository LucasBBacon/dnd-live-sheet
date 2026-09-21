import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useRollStore } from "../store/rollStore";
import { useAbilities } from "./useCharacterStats";
import { DiceEngine, type Ability } from "@project/engine";

export interface CheckRollRequest {
  /** What is being rolled, for the prompt and the roll log. */
  label: string;
  modifier: number;
  target: "ABILITY_CHECK" | "SAVING_THROW";
  ability?: Ability;
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
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  const { finalAbilities, activeStates } = useAbilities();
  const abilityScores = Object.fromEntries(
    Object.entries(finalAbilities).map(([ability, derived]) => [
      ability,
      derived.score,
    ]),
  ) as Record<Ability, number>;

  return async ({ label, modifier, target, ability }: CheckRollRequest) => {
    let rolled: number;

    try {
      rolled = await requestRoll("1d20", `Roll ${label} (${signed(modifier)})`, {
        targetLabel: label,
      });
    } catch {
      return;
    }

    const resolved = DiceEngine.applyDiceRulesToRollResult(
      { total: rolled + modifier, rolls: [rolled], modifier },
      getActiveTraits?.().flatMap((trait) => trait.diceRules ?? []) ?? [],
      target,
      {
        activeStates,
        sides: 20,
        ...(ability !== undefined && { ability }),
        abilityScores,
      },
    );

    recordRollResult({
      characterId,
      rollResults: [
        {
          ...resolved,
          target,
          label,
        },
      ],
      timestamp: Date.now(),
    });
  };
};
