import type {
  CriticalHitModifier,
  FixedProficiencyGrant,
  RuntimeModifier,
  WeaponDefinition,
} from "@project/shared";
import { AbilityEngine } from "./abilities.js";
import type { Ability } from "../types/core.js";
import type { WeaponAttackContext } from "../types/combat.js";
import { DiceEngine } from "../utils/diceParser.js";

export interface DerivedAttack {
  weaponId: string;
  name: string;
  attackBonus: number;
  damageBonus: number;
  damageExpression: string; // e.g., '1d8 + 4'
  criticalDamageExpression: string; // e.g., '2d8 + 4'
  criticalDamageMaximized: boolean;
  isProficient: boolean;
  context: WeaponAttackContext;
  breakdown: {
    governingStat: string;
    attack: string[];
    damage: string[];
  };
}

/**
 * The CombatEngine class provides methods to calculate derived combat statistics for a character based on their ability scores, proficiency, and weapon properties.
 * It encapsulates the logic for determining the governing ability score modifier, calculating attack bonuses, and generating damage expressions.
 */
export class CombatEngine {
  // region Derive Stat

  /**
   * Determines if any active states override the governing ability score for attacks.
   * @param activeStates An array of strings representing the current active states affecting the character.
   * @returns The Ability that should govern the attack calculations, or undefined if no overrides are present.
   */
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

    // 1 - fetch mods
    const strMod = AbilityEngine.getModifier(abilityScores.STR);
    const dexMod = AbilityEngine.getModifier(abilityScores.DEX);
    const chaMod = AbilityEngine.getModifier(abilityScores.CHA);
    const wisMod = AbilityEngine.getModifier(abilityScores.WIS);

    // 2 - determine governing stat based on weapon properties and active states
    const stateOverride = this.stateDrivenGoverningStat(activeStates);
    // 3 - overrides 
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

    // 4 - default logic based on weapon properties
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

  // endregion

  // region Attack Matrix

  /**
   * Infers the attack type based on the weapon's category and properties.
   * @param weapon The weapon definition object containing properties and categories
   * @returns A string representing the inferred attack type: "melee_weapon", "ranged_weapon", "melee_spell", or "ranged_spell".
   */
  private static inferAttackType(
    weapon: WeaponDefinition,
  ): "melee_weapon" | "ranged_weapon" | "melee_spell" | "ranged_spell" {
    const isRangedCategory =
      weapon.category === "simple_ranged" ||
      weapon.category === "martial_ranged";

    return isRangedCategory ? "ranged_weapon" : "melee_weapon";
  }

  /**
   * Determines if a given critical hit modifier applies to the current attack context based on required and forbidden states, as well as required attack types.
   * @param modifier The critical hit modifier being evaluated
   * @param attackType The attack classification that the modifier rules should match against
   * @param activeStates Flat array of all active states affecting the character
   * @returns A boolean indicating whether the critical hit modifier applies to the current attack context
   */
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
      return false; // required states not met
    }

    if (
      modifier.forbiddenStates?.some((state) => activeStates.includes(state))
    ) {
      return false; // forbidden states present
    }

    if (modifier.requiredAttackTypes.length === 0) {
      return true; // no specific attack type required
    }

    // check if the attack type matches any of the required attack types
    return modifier.requiredAttackTypes.includes(attackType);
  }

  /**
   * Applies a critical hit modifier to the base damage dice expression based on the modifier's type and properties.
   * @param baseDice The base damage dice expression (e.g., "1d8")
   * @param modifier The critical hit modifier being applied
   * @returns A new damage dice expression reflecting the applied critical hit modifier
   */
  private static applyCriticalHitModifier(
    baseDice: string,
    modifier: CriticalHitModifier,
  ): string {
    if (modifier.type === "add_base_die") {
      // if the base dice is a valid dice expression, parse it and add one more die of the same type
      try {
        const { count, sides } = DiceEngine.parse(baseDice);
        return `${count + 1}d${sides}`;
      } catch {
        return baseDice;
      }
    }

    if (modifier.type === "add_specific_die" && modifier.diceToAdd) {
      // if the modifier specifies a specific die to add, append it to the base dice expression
      return modifier.diceToAdd;
    }

    // if the modifier type is unrecognized, return the base dice expression unchanged
    return baseDice;
  }

  /**
   * Formats the final damage expression by combining the base dice expression, total damage bonus, and damage type into a single string.
   * @param damageDiceExpression The base damage dice expression (e.g., "1d8")
   * @param totalDamageBonus The total damage bonus to be added to the base damage
   * @param damageType The type of damage being dealt (e.g., "slashing", "fire")
   * @returns A formatted string representing the complete damage expression (e.g., "1d8 + 4 slashing")
   */
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
   * Resolves the attack context based on active states and any explicitly provided context, determining the hand used, attack usage, and whether a two-handed grip is applied.
   * @param activeStates Flat array of all active states affecting the character
   * @param attackContext Optional explicit hand and usage metadata for the requested attack
   * @returns A fully resolved WeaponAttackContext object reflecting the current attack context
   */
  private static resolveAttackContext(
    activeStates: string[],
    attackContext?: WeaponAttackContext,
  ): WeaponAttackContext {
    if (attackContext) {
      // if an explicit context is provided, respect it 
      // but resolve the two-handed grip state based on active states if not explicitly set
      return {
        ...attackContext,
        isTwoHandedGrip:
          attackContext.isTwoHandedGrip ??
          activeStates.includes("two_handed_grip"),
      };
    }

    // if no explicit context is provided, infer the hand and usage based on active states
    const isOffhand = activeStates.includes("offhand_attack");

    // if no explicit context is provided, infer the hand and usage based on active states
    return {
      hand: isOffhand ? "off_hand" : "main_hand",
      attackUsage: isOffhand ? "two_weapon_bonus" : "standard",
      isTwoHandedGrip: activeStates.includes("two_handed_grip"),
    };
  }

  /**
   * Resolves the effective value of a runtime modifier based on its source and the governing ability modifier.
   * @param modifier The runtime modifier being evaluated
   * @param governingMod The governing ability score modifier for the current attack context
   * @returns The effective numeric value of the modifier, taking into account its source and any relevant overrides
   */
  private static resolveModifierValue(
    modifier: RuntimeModifier,
    governingMod: number,
    classLevels: Record<string, number> = {},
  ): number {
    if (
      modifier.valueSource === "attack_ability_modifier" ||
      modifier.valueSource === "governing_stat_modifier"
    ) {
      return governingMod; // if the modifier's value is derived from the governing stat, return the governing modifier
    }

    if (modifier.scalingFactor === "class_level" && modifier.scalingClassId) {
      return modifier.value * (classLevels[modifier.scalingClassId] ?? 0);
    }

    if (
      modifier.scalingFactor === "class_level_thresholds" &&
      modifier.scalingClassId
    ) {
      const classLevel = classLevels[modifier.scalingClassId] ?? 0;
      return (modifier.scalingThresholds ?? []).reduce(
        (resolved, threshold) =>
          classLevel >= threshold.minimumLevel ? threshold.value : resolved,
        0,
      );
    }

    return modifier.value; // otherwise, return the static value defined in the modifier
  }

  // endregion

  // region Weapon Attack

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
   * @param attackContext Explicit hand and usage metadata for the requested attack
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
    attackContext?: WeaponAttackContext,
    classLevels: Record<string, number> = {},
  ): DerivedAttack {
    const resolvedContext = this.resolveAttackContext(
      activeStates,
      attackContext,
    );

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

      return m.attackContext === resolvedContext.hand;
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
    const isOffhand = resolvedContext.hand === "off_hand";
    const isTwoWeaponBonusAttack =
      resolvedContext.attackUsage === "two_weapon_bonus";
    const hasTWFStyle = activeStates.includes("two_weapon_fighting_style");

    if (
      isOffhand &&
      isTwoWeaponBonusAttack &&
      !hasTWFStyle &&
      baseDamageBonus > 0
    ) {
      baseDamageBonus = 0;
      damageBreakdown.push(`Offhand Damage (+0)`);
    } else {
      damageBreakdown.push(
        `${statName} (${baseDamageBonus >= 0 ? "+" : ""}${baseDamageBonus})`,
      );
    }

    let totalDamageBonus = baseDamageBonus;

    for (const mod of damageMods) {
      const bonusValue = this.resolveModifierValue(
        mod,
        governingMod,
        classLevels,
      );

      totalDamageBonus += bonusValue;
      damageBreakdown.push(
        `${mod.sourceName} (${bonusValue >= 0 ? "+" : ""}${bonusValue})`,
      );
    }

    // determine based dice (versatile check)
    const isTwoHandedGrip = resolvedContext.isTwoHandedGrip ?? false;
    const hasVersatile =
      weapon.properties.includes("versatile") && weapon.versatileDamageDice;
    const finalDice =
      isTwoHandedGrip && hasVersatile
        ? weapon.versatileDamageDice
        : weapon.damageDice;

    // determine attack type for critical hit modifiers
    const resolvedAttackType = attackType ?? this.inferAttackType(weapon);
    let damageDiceExpression = finalDice ?? weapon.damageDice;
    let criticalDamageDiceExpression = damageDiceExpression;
    let criticalDamageMaximized = false;

    // apply critical hit modifiers if this is a critical hit
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

      // if the modifier is of type 'maximize_dice', set the criticalDamageMaximized flag to true
      if (modifier.type === "maximize_dice") {
        criticalDamageMaximized = true;
        continue;
      }

      // if the modifier is of type 'add_base_die' or 'add_specific_die', apply it to the critical damage dice expression
      criticalDamageDiceExpression = this.applyCriticalHitModifier(
        criticalDamageDiceExpression,
        modifier,
      );
    }

    // if this is a critical hit and the critical damage is maximized, override the damage dice expression to reflect maximized damage
    if (isCriticalHit) {
      damageDiceExpression = criticalDamageDiceExpression;
    }

    // format the final damage expressions for both normal and critical hits
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
      damageBonus: totalDamageBonus,
      damageExpression,
      criticalDamageExpression,
      criticalDamageMaximized,
      isProficient,
      context: resolvedContext,
      breakdown: {
        governingStat: statName,
        attack: attackBreakdown,
        damage: damageBreakdown,
      },
    };
  }

  // endregion
}
