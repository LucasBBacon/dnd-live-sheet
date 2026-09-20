import type { RuntimeModifier } from "@project/shared";
import type { CastingSource } from "../rules/casterLevel.js";
import type { Ability } from "../types/core.js";
import { AbilityEngine } from "./abilities.js";

/** The two numbers a caster needs, for one of their casting classes. */
export interface DerivedSpellcasting {
  classId: string;
  ability: Ability;
  modifier: number;
  /** 8 + proficiency + modifier. */
  saveDc: number;
  /** proficiency + modifier. */
  attackBonus: number;
  /** Warlocks only: the level every pact slot is cast at. */
  pactSlotLevel?: number;
  breakdown: string;
}

/**
 * The PHB's pact slot level track, which rises every second warlock level and
 * stops at five. Authored in the pack as `pact_slot_level` for the sheet to
 * show beside the pool; repeated here because this result is what the roll
 * layer reads, and it should not have to resolve a resource to answer "what
 * level does this warlock cast at".
 */
const pactSlotLevel = (warlockLevel: number): number =>
  Math.min(5, Math.ceil(warlockLevel / 2));

export class SpellcastingEngine {
  /**
   * The save DC and attack bonus for each class that casts.
   *
   * One entry per class, not one per character: a wizard/cleric has an INT DC
   * and a WIS DC, and collapsing them would report a number that is wrong for
   * half of what they cast.
   * @param sources Every casting class the character holds.
   * @param abilityScores The character's final ability scores.
   * @param profBonus The character's proficiency bonus.
   * @param modifiers Every active runtime modifier.
   * @param activeStates The character's active states, which gate modifiers.
   * @returns One DerivedSpellcasting per source, in the order given.
   */
  public static calculate(
    sources: CastingSource[],
    abilityScores: Record<Ability, number>,
    profBonus: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): DerivedSpellcasting[] {
    // SPELLCASTING_MOD was declared in ModifierTargetSchema and read by nothing
    // until this calculator existed
    const bonuses = modifiers.filter((mod) => {
      if (!mod.isActive) return false;
      if (mod.target !== "SPELLCASTING_MOD" || mod.type !== "add") return false;
      if (mod.forbiddenStates?.some((state) => activeStates.includes(state))) {
        return false;
      }
      return mod.requiredStates
        ? mod.requiredStates.every((state) => activeStates.includes(state))
        : true;
    });

    return sources.map((source) => {
      const abilityMod = AbilityEngine.getModifier(abilityScores[source.ability]);
      const tokens = [
        `${source.ability} (${abilityMod >= 0 ? "+" : ""}${abilityMod})`,
        `Proficiency (+${profBonus})`,
      ];

      let total = abilityMod;
      for (const bonus of bonuses) {
        total += bonus.value;
        tokens.push(
          `${bonus.sourceName} (${bonus.value >= 0 ? "+" : ""}${bonus.value})`,
        );
      }

      return {
        classId: source.classId,
        ability: source.ability,
        modifier: total,
        saveDc: 8 + profBonus + total,
        attackBonus: profBonus + total,
        ...(source.progression === "pact" && {
          pactSlotLevel: pactSlotLevel(source.level),
        }),
        breakdown: tokens.join(" | "),
      };
    });
  }
}
