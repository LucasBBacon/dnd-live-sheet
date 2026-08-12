import type { FixedProficiencyGrant, RuntimeModifier } from "@project/shared";
import { AbilityEngine } from "./abilities.js";
import type { Ability } from "../types/core.js";

export interface DerivedSave {
  ability: Ability;
  totalModifier: number;
  isProficient: boolean;
  breakdown: string;
}

const ABILITY_SAVE_TARGET: Record<Ability, string> = {
  STR: "STR_SAVE",
  DEX: "DEX_SAVE",
  CON: "CON_SAVE",
  INT: "INT_SAVE",
  WIS: "WIS_SAVE",
  CHA: "CHA_SAVE",
};

const PROFICIENCY_MULTIPLIERS: Record<string, number> = {
  half: 0.5,
  proficient: 1,
  expertise: 2,
};

/**
 * The SaveEngine class provides methods for calculating saving throw modifiers based on a character's ability scores, proficiency bonuses, and any active modifiers or states.
 * It computes the total modifier for each saving throw, taking into account proficiency levels and any relevant modifiers that may apply to the saving throw.
 */
export class SaveEngine {
  /**
   * Calculates the saving throw modifiers for all abilities (STR, DEX, CON, INT, WIS, CHA) based on the provided ability scores, proficiency bonus, proficiencies, and active modifiers.
   * @param abilityScores A record of the character's ability scores.
   * @param profBonus The character's proficiency bonus.
   * @param proficiencies An array of FixedProficiencyGrant objects representing the character's saving throw proficiencies.
   * @param modifiers An array of RuntimeModifier objects representing any active modifiers that may affect saving throws.
   * @param activeStates An optional array of strings representing the character's current active states, which may influence the applicability of certain modifiers or proficiencies.
   * @returns A record mapping each ability to its corresponding DerivedSave object, which includes the total modifier, proficiency status, and a breakdown of the calculation.
   */
  public static calculateSaves(
    abilityScores: Record<Ability, number>,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): Record<string, DerivedSave> {
    const saves: Record<string, DerivedSave> = {};

    for (const ability of [
      "STR",
      "DEX",
      "CON",
      "INT",
      "WIS",
      "CHA",
    ] as Ability[]) {
      saves[ability] = this.calculateSave(
        ability,
        abilityScores[ability],
        abilityScores.CHA,
        profBonus,
        proficiencies,
        modifiers,
        activeStates,
      );
    }

    return saves;
  }

  /**
   * Calculates the saving throw modifier for a specific ability based on the character's ability score, proficiency bonus, proficiencies, and any active modifiers or states.
   * @param ability The ability for which the saving throw is being calculated (e.g., "STR", "DEX", "CON", "INT", "WIS", "CHA").
   * @param abilityScore The character's score for the specified ability.
   * @param chaScore The character's Charisma score, used for certain modifiers that depend on Charisma.
   * @param profBonus The character's proficiency bonus.
   * @param proficiencies An array of FixedProficiencyGrant objects representing the character's saving throw proficiencies.
   * @param modifiers An array of RuntimeModifier objects representing any active modifiers that may affect the saving throw.
   * @param activeStates An optional array of strings representing the character's current active states, which may influence the applicability of certain modifiers or proficiencies.
   * @returns A DerivedSave object containing the total modifier, proficiency status, and a breakdown of the calculation for the specified ability's saving throw.
   */
  private static calculateSave(
    ability: Ability,
    abilityScore: number,
    chaScore: number,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[],
  ): DerivedSave {
    const breakdown: string[] = [];
    const abilityMod = AbilityEngine.getModifier(abilityScore);
    const sign = abilityMod >= 0 ? "+" : "";
    breakdown.push(`${ability} (${sign}${abilityMod})`);

    // check for saving throw proficiency
    const relevantGrants = proficiencies.filter(
      (p) =>
        p.category === "saving_throws" &&
        p.proficiencyId.toUpperCase() === ability &&
        (p.requiredStates.length === 0 ||
          p.requiredStates.every((s) => activeStates.includes(s))),
    );

    let maxMultiplier = 0;
    for (const grant of relevantGrants) {
      const multiplier = PROFICIENCY_MULTIPLIERS[grant.level] ?? 0;
      if (multiplier > maxMultiplier) maxMultiplier = multiplier;
    }

    let profContribution = 0;
    if (maxMultiplier > 0) {
      profContribution = Math.floor(profBonus * maxMultiplier);
      breakdown.push(`Proficiency (+${profContribution})`);
    }

    const saveTarget = ABILITY_SAVE_TARGET[ability]!;
    const validMods = modifiers.filter((m) => {
      if (!m.isActive) return false;
      if (m.target !== saveTarget && m.target !== "ALL_SAVES") return false;
      if (m.forbiddenStates?.some((s) => activeStates.includes(s)))
        return false;
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    let modBonus = 0;
    for (const mod of validMods) {
      if (mod.type !== "add") continue;

      const chaMod = AbilityEngine.getModifier(chaScore);
      const bonusValue =
        mod.valueSource === "cha_modifier" ? chaMod : mod.value;

      if (bonusValue === 0) continue;

      modBonus += bonusValue;
      const s = bonusValue >= 0 ? "+" : "";
      breakdown.push(`${mod.sourceName} (${s}${bonusValue})`);
    }

    const totalModifier = abilityMod + profContribution + modBonus;

    return {
      ability,
      totalModifier,
      isProficient: maxMultiplier > 0,
      breakdown: breakdown.join(" + "),
    };
  }
}
