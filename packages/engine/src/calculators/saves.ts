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

export class SaveEngine {
  /**
   * Calculates all six saving throw modifiers given the full ability score map.
   */
  public static calculateSaves(
    abilityScores: Record<Ability, number>,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): Record<string, DerivedSave> {
    const saves: Record<string, DerivedSave> = {};

    for (const ability of ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as Ability[]) {
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
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) return false;
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
