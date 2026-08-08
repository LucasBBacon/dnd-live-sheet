import type { Ability } from "@project/engine";

export type LevelUpAbilityChoice = {
  stat: Ability;
  value: number;
};

export const getProjectedConModifier = (
  finalAbilities:
    | Record<string, { score: number; modifier: number }>
    | undefined,
  asiChoices: LevelUpAbilityChoice[] | undefined,
): number => {
  const baseConScore = finalAbilities?.CON?.score ?? 10;
  const conIncrease = (asiChoices ?? [])
    .filter((choice) => choice.stat === "CON")
    .reduce((total, choice) => total + choice.value, 0);

  const projectedScore = baseConScore + conIncrease;
  return Math.floor((projectedScore - 10) / 2);
};
