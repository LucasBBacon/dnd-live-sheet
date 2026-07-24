import type {
  FixedProficiencyGrant,
  RuntimeModifier,
  WeaponDefinition,
} from "@project/shared";
import { AbilityEngine } from "./abilities.js";
import type { Ability } from "../types/core.js";

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
   * @param abilityScores The character's base ability scores.
   * @returns An object containing the name of the governing ability score and its modifier
   */
  private static determineGoverningModifier(
    weapon: WeaponDefinition,
    abilityScores: Record<Ability, number>,
  ): { statName: Ability; mod: number } {
    const isRangedCategory =
      weapon.category === "simple_ranged" ||
      weapon.category === "martial_ranged";
    const hasFinesse = weapon.properties.includes("finesse");

    const strMod = AbilityEngine.getModifier(abilityScores.STR);
    const dexMod = AbilityEngine.getModifier(abilityScores.DEX);

    if (hasFinesse) {
      return dexMod > strMod
        ? { statName: "DEX", mod: dexMod }
        : { statName: "STR", mod: strMod };
    }

    if (isRangedCategory) {
      return { statName: "DEX", mod: dexMod };
    }

    // default for melee and thrown melee
    return { statName: "STR", mod: strMod };
  }

  /**
   * Calculates the final attack matrix for a given equipped weapon.
   * @param weapon The weapon definition object containing properties and categories
   * @param abilityScores The character's base ability scores
   * @param profBonus The character's proficiency bonus
   * @param proficiencies The character's proficiencies flat array
   * @param modifiers List of runtime modifiers current active in the character
   * @param activeStates Flat array of all active states affecting the character
   * @returns A DerivedAttack object containing the calculated attack bonus, damage expression, and breakdown of contributing factors
   */
  public static calculateWeaponAttack(
    weapon: WeaponDefinition,
    abilityScores: Record<Ability, number>,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): DerivedAttack {
    // 1 - resolve governing stat
    // TODO: intercept here for hexblade/shillelagh overrides if activeStates dictate it
    const { statName, mod: governingMod } = this.determineGoverningModifier(
      weapon,
      abilityScores,
    );

    // 2 - check proficiencies
    const isProficient = proficiencies.some(
      (p) =>
        p.category === "weapons" &&
        (p.proficiencyId === weapon.category || p.proficiencyId === weapon.id),
    );

    // filter active modifiers for this specific attack
    const validMods = modifiers.filter((m) => {
      if (!m.isActive) return false;
      if (m.forbiddenStates?.some((s) => activeStates.includes(s)))
        return false;
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    const attackMods = validMods.filter(
      (m) => m.target === "ATTACK_BONUS" && m.type === "add",
    );
    const damageMods = validMods.filter(
      (m) => m.target === "DAMAGE_BONUS" && m.type === "add",
    );

    // 3 - calculate attack bonus
    let attackBonus = governingMod;
    const attackBreakdown = [
      `${statName} (${governingMod > 0 ? "+" : ""}${governingMod})`,
    ];

    if (isProficient) {
      attackBonus += profBonus;
      attackBreakdown.push(`Proficiency (+${profBonus})`);
    }

    for (const mod of attackMods) {
      attackBonus += mod.value;
      attackBreakdown.push(
        `${mod.sourceName} (${mod.value >= 0 ? "+" : ""}${mod.value})`,
      );
    }

    // 4 - calculate damage
    let baseDamageBonus = governingMod;

    // 5e rule - offhand attacks don't add positive stat mods to damage unless TWF style
    const isOffhand = activeStates.includes("offhand_attack");
    const hasTWFStyle = activeStates.includes("two_weapon_fighting_style");

    if (isOffhand && !hasTWFStyle && baseDamageBonus > 0) {
      baseDamageBonus = 0;
      attackBreakdown.push(`Offhand Damage (+0)`);
    } else {
      attackBreakdown.push(
        `${statName} (${baseDamageBonus >= 0 ? "+" : ""}${baseDamageBonus})`,
      );
    }

    let totalDamageBonus = baseDamageBonus;
    const damageBreakdown = [`${statName} Bonus (${baseDamageBonus})`];

    for (const mod of damageMods) {
      totalDamageBonus += mod.value;
      attackBreakdown.push(
        `${mod.sourceName} (${mod.value >= 0 ? "+" : ""}${mod.value})`,
      );
    }

    // determine based dice (versatile check)
    const isTwoHandedGrip = activeStates.includes("two_handed_grip");
    const hasVersatile =
      weapon.properties.includes("versatile") && weapon.versatileDamageDice;
    const finalDice =
      isTwoHandedGrip && hasVersatile
        ? weapon.versatileDamageDice
        : weapon.damageDice;

    const damageExpression =
      totalDamageBonus === 0
        ? `${finalDice} ${weapon.damageType}`
        : `${finalDice} ${Math.abs(totalDamageBonus)} ${weapon.damageType}`;

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
