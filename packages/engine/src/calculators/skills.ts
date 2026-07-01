import { SKILL_MAP, type ProficiencyLevel } from "../types/core.js";
import { AbilityEngine } from "./abilities.js";

export interface DerivedSkill {
  id: string;
  name: string;
  totalModifier: number;
  isProficient: boolean;
  hasExpertise: boolean;
  breakdown: string; // UI tooltips
}

/**
 * SkillEngine is a utility class that provides methods for calculating skill modifiers based on ability scores, proficiency levels, and proficiency bonuses in a Dungeons & Dragons 5e ruleset context.
 */
export class SkillEngine {
  /**
   * Generates the final modifier for a given skill.
   * @param skillId The unique identifier for the skill (e.g., "athletics", "stealth")
   * @param abilityScore The character's ability score associated with the skill (e.g., Strength for Athletics)
   * @param profLevel The character's proficiency level with the skill ("none", "proficient", or "expertise")
   * @param profBonus The character's proficiency bonus, which is added to the skill modifier if the character is proficient or has expertise
   * @returns A DerivedSkill object containing the skill's ID, name, total modifier, proficiency status, expertise status, and a breakdown string for UI tooltips
   * @throws An error if the skillId does not correspond to a valid skill in the SKILL_MAP
   */
  public static calculateSkill(
    skillId: string,
    abilityScore: number,
    profLevel: ProficiencyLevel,
    profBonus: number,
    // TODO: flat modifiers (e.g., +1 from Luckstone)
  ): DerivedSkill {
    const def = SKILL_MAP[skillId];
    if (!def)
      throw new Error(`Skill definition not found for skillId: ${skillId}`);

    const abilityMod = AbilityEngine.getModifier(abilityScore);

    let appliedProf = 0;
    if (profLevel === "proficient") appliedProf = profBonus;
    if (profLevel === "expertise") appliedProf = profBonus * 2;

    const totalModifier = abilityMod + appliedProf;

    return {
      id: def.id,
      name: def.name,
      totalModifier,
      isProficient: profLevel !== "none",
      hasExpertise: profLevel === "expertise",
      breakdown: `Base ${def?.ability.toUpperCase()} (${abilityMod > 0 ? "+" : ""}${abilityMod}) + Proficiency (${appliedProf})`,
    };
  }
}
