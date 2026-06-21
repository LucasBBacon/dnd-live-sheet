import type { z } from "zod";
import type { ModifierSchema } from "../schemas/character.js";
import { calculateAbilityModifier } from "./core.js";
import { sumModifiers } from "./reducers.js";

type Modifier = z.infer<typeof ModifierSchema>;

/**
 * Calculates Armor Class (AC).
 * Handles base AC, dex mods (with potential caps for med armor),
 * and dynamic bonuses from shields or magical items
 * @param baseAc The base armor class provided by the armor.
 * @param dexScore The character's Dexterity score.
 * @param modifiers A list of modifiers affecting the AC.
 * @param isArmored Whether the character is wearing armor.
 * @param maxDexBonus The maximum Dexterity bonus allowed by the armor.
 * @returns The calculated Armor Class (AC).
 */
export const calculateArmorClass = (
  baseAc: number,
  dexScore: number,
  modifiers: Modifier[],
  isArmored: boolean = false,
  maxDexBonus: number | null = null,
): number => {
  let dexMod = calculateAbilityModifier(dexScore);

  // apply armor dexterity caps if applicable
  if (maxDexBonus !== null && dexMod > maxDexBonus) {
    dexMod = maxDexBonus;
  }

  // sum all external AC bonuses (e.g., equipped shield, rings of protection etc)
  const externalBonuses = sumModifiers(modifiers, "ac", "bonus");

  // if unarmored, standard baseline is 10
  // TODO: Inject unarmored defense from Monk/Barbarians
  // into 'modifiers' array as external bonus based on wis/con
  const effectiveBase = isArmored ? baseAc : 10;

  return effectiveBase + dexMod + externalBonuses;
};

/**
 * Calculates Maximum Hit Points (HP) safely, ensuring characters never lose max HP
 * retroactively if their Con mod is severely negative.
 * @param baseHp The base HP provided by the character's first level class.
 * @param conScore The character's Constitution score.
 * @param level The character's total level.
 * @param hpIncreases An array of HP increases from each level-up (after the first).
 * @param modifiers A list of modifiers affecting the maximum HP (e.g., from feats, items, or spells).
 * @returns The calculated maximum hit points (HP) for the character.
 */
export const calculateMaxHp = (
  baseHp: number,
  conScore: number,
  level: number,
  hpIncreases: number[],
  modifiers: Modifier[],
): number => {
  const conMod = calculateAbilityModifier(conScore);
  const externalBonuses = sumModifiers(modifiers, 'hp_max', 'bonus');

  const totalRolledHp = hpIncreases.reduce((sum, val) => sum + val, 0);

  // 5e rules -- hp gain per level is AT LEAST 1, even with neg con mod
  // apply the con mod for lvl 1 (baseHp) + every subsequent lvl
  let conContribution = conMod * level;

  // edge case -- if con mod is so low it would reduce hp below 1/lvl
  // floor the total hp calc to ensure a min of 1 hp/lvl
  const coreHp = Math.max(level, baseHp + totalRolledHp, conContribution);

  return coreHp + externalBonuses;
};
