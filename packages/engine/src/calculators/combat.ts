import type {
  CriticalHitModifier,
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
  criticalDamageExpression: string; // e.g., '2d8 + 4'
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
  private static stateDrivenGoverningStat(
    activeStates: string[] = [],
  ): Ability | undefined {
    const overrides = new Map<string, Ability>([
      ["hexblade", "CHA"],
      ["shillelagh", "WIS"],
      ["governing_stat_cha", "CHA"],
      ["governing_stat_wis", "WIS"],
      ["governing_stat_str", "STR"],
      ["governing_stat_dex", "DEX"],
    ]);

    for (const state of activeStates) {
      const override = overrides.get(state);
      if (override) return override;
    }

    return undefined;
  }

  /**
   * Determines the governing ability score modifier based on weapon properties.
   * @param weapon The weapon definition object containing properties and categories
   * @param abilityScores The character's base ability scores.
   * @returns An object containing the name of the governing ability score and its modifier
   */
  private static determineGoverningModifier(
    weapon: WeaponDefinition,
    abilityScores: Record<Ability, number>,
    activeStates: string[] = [],
  ): { statName: Ability; mod: number } {
    const isRangedCategory =
      weapon.category === "simple_ranged" ||
      weapon.category === "martial_ranged";
    const hasFinesse = weapon.properties.includes("finesse");

    const strMod = AbilityEngine.getModifier(abilityScores.STR);
    const dexMod = AbilityEngine.getModifier(abilityScores.DEX);
    const chaMod = AbilityEngine.getModifier(abilityScores.CHA);
    const wisMod = AbilityEngine.getModifier(abilityScores.WIS);

    const stateOverride = this.stateDrivenGoverningStat(activeStates);
    if (stateOverride === "CHA") {
      return { statName: "CHA", mod: chaMod };
    }

    if (stateOverride === "WIS") {
      return { statName: "WIS", mod: wisMod };
    }

    if (stateOverride === "STR") {
      return { statName: "STR", mod: strMod };
    }

    if (stateOverride === "DEX") {
      return { statName: "DEX", mod: dexMod };
    }

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

  private static inferAttackType(
    weapon: WeaponDefinition,
  ): "melee_weapon" | "ranged_weapon" | "melee_spell" | "ranged_spell" {
    const isRangedCategory =
      weapon.category === "simple_ranged" ||
      weapon.category === "martial_ranged";

    return isRangedCategory ? "ranged_weapon" : "melee_weapon";
  }

  private static matchesCriticalHitModifier(
    modifier: CriticalHitModifier,
    attackType:
      | "melee_weapon"
      | "ranged_weapon"
      | "melee_spell"
      | "ranged_spell",
    activeStates: string[] = [],
  ): boolean {
    if (
      modifier.requiredStates?.some((state) => !activeStates.includes(state))
    ) {
      return false;
    }

    if (
      modifier.forbiddenStates?.some((state) => activeStates.includes(state))
    ) {
      return false;
    }

    if (modifier.requiredAttackTypes.length === 0) {
      return true;
    }

    return modifier.requiredAttackTypes.includes(attackType);
  }

  private static applyCriticalHitModifier(
    baseDice: string,
    modifier: CriticalHitModifier,
  ): string {
    if (modifier.type === "add_base_die") {
      const match = baseDice.match(/^(\d+)d(\d+)$/i);
      if (!match || !match[1] || !match[2]) return baseDice;
      return `${Number.parseInt(match[1], 10) + 1}d${match[2]}`;
    }

    if (modifier.type === "add_specific_die" && modifier.diceToAdd) {
      return modifier.diceToAdd;
    }

    if (modifier.type === "maximize_dice") {
      return baseDice;
    }

    return baseDice;
  }

  private static formatDamageExpression(
    damageDiceExpression: string,
    totalDamageBonus: number,
    damageType: string,
  ): string {
    return totalDamageBonus === 0
      ? `${damageDiceExpression} ${damageType}`
      : `${damageDiceExpression} ${totalDamageBonus > 0 ? "+" : ""}${totalDamageBonus} ${damageType}`;
  }

  /**
   * Calculates the final attack matrix for a given equipped weapon.
   * @param weapon The weapon definition object containing properties and categories
   * @param abilityScores The character's base ability scores
   * @param profBonus The character's proficiency bonus
   * @param proficiencies The character's proficiencies flat array
   * @param modifiers List of runtime modifiers current active in the character
   * @param activeStates Flat array of all active states affecting the character
   * @param criticalHitModifiers Optional list of critical-hit modifiers granted by traits
   * @param isCriticalHit Whether the attack being evaluated is a critical hit
   * @param attackType The attack classification that the modifier rules should match against
   * @returns A DerivedAttack object containing the calculated attack bonus, damage expression, and breakdown of contributing factors
   */
  public static calculateWeaponAttack(
    weapon: WeaponDefinition,
    abilityScores: Record<Ability, number>,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
    criticalHitModifiers: CriticalHitModifier[] = [],
    isCriticalHit = false,
    attackType?:
      | "melee_weapon"
      | "ranged_weapon"
      | "melee_spell"
      | "ranged_spell",
  ): DerivedAttack {
    // 1 - resolve governing stat
    const { statName, mod: governingMod } = this.determineGoverningModifier(
      weapon,
      abilityScores,
      activeStates,
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
    const damageMods = validMods.filter((m) => {
      if (m.target !== "DAMAGE_BONUS" || m.type !== "add") return false;

      if (m.attackContext === undefined) return true;

      const requestIsOffhand = activeStates.includes("offhand_attack");
      return requestIsOffhand
        ? m.attackContext === "off_hand"
        : m.attackContext === "main_hand";
    });

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
    const damageBreakdown: string[] = [];

    // 5e rule - offhand attacks don't add positive stat mods to damage unless TWF style
    const isOffhand = activeStates.includes("offhand_attack");
    const hasTWFStyle = activeStates.includes("two_weapon_fighting_style");

    if (isOffhand && !hasTWFStyle && baseDamageBonus > 0) {
      baseDamageBonus = 0;
      damageBreakdown.push(`Offhand Damage (+0)`);
    } else {
      damageBreakdown.push(
        `${statName} (${baseDamageBonus >= 0 ? "+" : ""}${baseDamageBonus})`,
      );
    }

    let totalDamageBonus = baseDamageBonus;

    for (const mod of damageMods) {
      const bonusValue =
        mod.valueSource === "governing_stat_modifier"
          ? governingMod
          : mod.value;

      totalDamageBonus += bonusValue;
      damageBreakdown.push(
        `${mod.sourceName} (${bonusValue >= 0 ? "+" : ""}${bonusValue})`,
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

    const resolvedAttackType = attackType ?? this.inferAttackType(weapon);
    let damageDiceExpression = finalDice ?? weapon.damageDice;
    let criticalDamageDiceExpression = damageDiceExpression;

    for (const modifier of criticalHitModifiers) {
      if (
        !this.matchesCriticalHitModifier(
          modifier,
          resolvedAttackType,
          activeStates,
        )
      ) {
        continue;
      }

      criticalDamageDiceExpression = this.applyCriticalHitModifier(
        criticalDamageDiceExpression,
        modifier,
      );
    }

    if (isCriticalHit) {
      damageDiceExpression = criticalDamageDiceExpression;
    }

    const damageExpression = this.formatDamageExpression(
      damageDiceExpression,
      totalDamageBonus,
      weapon.damageType,
    );
    const criticalDamageExpression = this.formatDamageExpression(
      criticalDamageDiceExpression,
      totalDamageBonus,
      weapon.damageType,
    );

    return {
      weaponId: weapon.id,
      name: weapon.name,
      attackBonus,
      damageExpression,
      criticalDamageExpression,
      isProficient,
      breakdown: {
        governingStat: statName,
        attack: attackBreakdown,
        damage: damageBreakdown,
      },
    };
  }
}
