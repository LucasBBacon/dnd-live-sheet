/**
 * Convert a raw ability score (1-30) into its corresponding modifier
 * Formula: round down ((score - 10) / 2)
 * @param score Raw ability score.
 * @returns Modifier score.
 */
export const calculateAbilityModifier = (score: number) => {
  return Math.floor((score - 10) / 2);
};

/**
 * Calculates a character's proficiency bonus based on their total level.
 * Formula: round up (level / 4) + 1
 * @param level Character total level.
 * @returns Character proficiency bonus.
 */
export const calculateProficiencyBonus = (level: number) => {
  return Math.ceil(level / 4) + 1;
};

/**
 * Calculates a passive skill score
 * @param abilityScore Ability score related to that skill.
 * @param isProficient Proficiency in the skill.
 * @param level Character total level.
 * @param flatBonuses e.g., Observant feat grants +5
 * @returns Passive skill score.
 */
export const calculateProficiencyScore = (
  abilityScore: number,
  isProficient: boolean,
  level: number,
  flatBonuses: number = 0,
): number => {
  const base = 10;
  const mod = calculateAbilityModifier(abilityScore);
  const prof = isProficient ? calculateProficiencyBonus(level) : 0;

  return base + mod + prof + flatBonuses;
};
