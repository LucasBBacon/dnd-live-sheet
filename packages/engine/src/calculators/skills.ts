import type { FixedProficiencyGrant, RuntimeModifier } from "@project/shared";
import { SKILL_MAP } from "../types/core.js";
import { AbilityEngine } from "./abilities.js";

export interface DerivedSkill {
  id: string;
  name: string;
  totalModifier: number;
  multiplier: number;
  breakdown: string; // UI tooltips
}

const PROFICIENCY_MULTIPLIERS: Record<string, number> = {
  none: 0,
  half: 0.5,
  proficient: 1,
  expertise: 2,
};

/**
 * SkillEngine is a utility class that provides methods for calculating skill modifiers based on ability scores, proficiency levels, and proficiency bonuses in a Dungeons & Dragons 5e ruleset context.
 */
export class SkillEngine {
  /**
   * Generates the final modifier for a given skill based on active states.
   * @param skillId The unique identifier for the skill (e.g., "history")
   * @param abilityScore The character's underlying ability score.
   * @param profBonus The character's current proficiency bonus based on total level.
   * @param proficiencies Array of all proficiency grants the character possess.
   * @param modifiers Array of all active runtime modifiers (items, buffs).
   * @param activeStates Array of string flags representing the current environment (e.g., ["history_artificer_lore"])
   * @returns
   */
  public static calculateSkill(
    skillId: string,
    abilityScore: number,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): DerivedSkill {
    const def = SKILL_MAP[skillId];
    if (!def)
      throw new Error(`Skill definition not found for skillId: ${skillId}`);

    const breakdown: string[] = [];
    const abilityMod = AbilityEngine.getModifier(abilityScore);
    const abilitySign = abilityMod >= 0 ? "+" : "-";
    breakdown.push(
      `Base ${def.ability.toUpperCase()} (${abilitySign}${abilityMod})`,
    );

    // determine highest valid prof multiplier
    const relevantGrants = proficiencies.filter(
      (p) => p.category === "skills" && p.proficiencyId === skillId,
    );
    let maxMultiplier = 0;
    for (const grant of relevantGrants) {
      // if the grant has required states, ensure they are all present
      const meetsRequirements = grant.requiredStates.every((state) =>
        activeStates.includes(state),
      );

      if (meetsRequirements) {
        const multiplier = PROFICIENCY_MULTIPLIERS[grant.level] ?? 0;
        if (multiplier > maxMultiplier) {
          maxMultiplier = multiplier;
        }
      }
    }

    // apply the proficiency bonus (5e - half prof rounded down)
    let appliedProf = 0;
    if (maxMultiplier > 0) {
      appliedProf = Math.floor(profBonus * maxMultiplier);
      breakdown.push(`Proficiency x${maxMultiplier} (+${appliedProf})`);
    }

    // apply flat modifiers targeting this specific skill / all ability checks
    const targetKeys = [skillId.toUpperCase() + "_CHECK", "ALL_CHECKS"]; // e.g., "STEALTH_CHECK"
    const activeMods = modifiers.filter(
      (m) => targetKeys.includes(m.target) && m.isActive,
    );

    let addedBonus = 0;
    for (const mod of activeMods) {
      if (mod.type === "add") {
        addedBonus += mod.value;
        const modSign = mod.value >= 0 ? "+" : "-";
        breakdown.push(`${mod.sourceName} (${modSign}${mod.value})`);
      }
    }

    const totalModifier = abilityMod + appliedProf + addedBonus;

    return {
      id: def.id,
      name: def.name,
      totalModifier,
      multiplier: maxMultiplier,
      breakdown: `Base ${def?.ability.toUpperCase()} (${abilityMod > 0 ? "+" : ""}${abilityMod}) + Proficiency (${appliedProf})`,
    };
  }
}
