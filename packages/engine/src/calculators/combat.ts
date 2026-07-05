import type { WeaponDefinition } from "../types/combat.js";
import { AbilityEngine } from "./abilities.js";

export interface DerivedAttack {
  weaponId: string;
  name: string;
  attackBonus: number;
  damageExpression: string; // e.g., '1d8 + 4'
  isProficient: boolean;
  breakdown: {
    governingStat: string;
    attack: string[];
    damage: string[];
  };
}

/**
 * The CombatEngine class provides methods to calculate derived combat statistics for a character based on their ability scores, proficiency, and weapon properties. It encapsulates the logic for determining the governing ability score modifier, calculating attack bonuses, and generating damage expressions.
 */
export class CombatEngine {
  /**
   * Determines the governing ability score modifier based on weapon properties.
   * @param weapon The weapon definition object containing properties and categories
   * @param strMod The character's Strength modifier
   * @param dexMod The character's Dexterity modifier
   * @returns An object containing the name of the governing ability score and its modifier
   */
  private static determineGoverningModifier(
    weapon: WeaponDefinition,
    strMod: number,
    dexMod: number,
  ): { statName: string; mod: number } {
    const isRanged = weapon.category.includes("ranged");
    const hasFinesse = weapon.properties.includes("finesse");

    if (hasFinesse) {
      return dexMod > strMod
        ? { statName: "DEX", mod: dexMod }
        : { statName: "STR", mod: strMod };
    }

    if (isRanged) {
      return { statName: "DEX", mod: dexMod };
    }

    // default for melee and thrown melee
    return { statName: "STR", mod: strMod };
  }

  /**
   * Calculates the final attack matrix for a given equipped weapon.
   * @param weapon The weapon definition object containing properties and categories
   * @param strScore The character's Strength score
   * @param dexScore The character's Dexterity score
   * @param profBonus The character's proficiency bonus
   * @param isProficient A boolean indicating if the character is proficient with the weapon
   * @param magicBonus An optional magic bonus to be added to both attack and damage rolls (default is 0)
   * @returns A DerivedAttack object containing the calculated attack bonus, damage expression, and breakdown of contributing factors
   */
  public static calculateWeaponAttack(
    weapon: WeaponDefinition,
    strScore: number,
    dexScore: number,
    profBonus: number,
    isProficient: boolean,
    magicBonus: number = 0, // extracted from modifiers in the parent pipeline
  ): DerivedAttack {
    const strMod = AbilityEngine.getModifier(strScore);
    const dexMod = AbilityEngine.getModifier(dexScore);

    // 1 - resolve governing stat
    const { statName, mod: governingMod } = this.determineGoverningModifier(
      weapon,
      strMod,
      dexMod,
    );

    // 2 - calculate attack bonus
    let attackBonus = governingMod + magicBonus;
    const attackBreakdown = [
      `${statName} (${governingMod > 0 ? "+" : ""}${governingMod})`,
    ];

    if (isProficient) {
      attackBonus += profBonus;
      attackBreakdown.push(`Proficiency (+${profBonus})`);
    }

    if (magicBonus > 0) {
      attackBreakdown.push(`Magic Bonus (+${magicBonus})`);
    }

    // 3 - calculate damage expression
    let damageBonus = governingMod + magicBonus;
    const damageBreakdown = [
      `${statName} (${governingMod > 0 ? "+" : ""}${governingMod})`,
    ];

    if (magicBonus > 0) {
      damageBreakdown.push(`Magic Bonus (${magicBonus})`);
    }

    const damageSign = damageBonus >= 0 ? "+" : "-";
    const damageExpression = `${weapon.damageDice} ${damageSign} ${Math.abs(damageBonus)} ${weapon.damageType}`;

    return {
      weaponId: weapon.id,
      name: weapon.name,
      attackBonus,
      damageExpression,
      isProficient,
      breakdown: {
        governingStat: statName,
        attack: attackBreakdown,
        damage: damageBreakdown,
      },
    };
  }
}
