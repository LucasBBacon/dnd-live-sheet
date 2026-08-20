import type {
  CriticalHitModifier,
  DamageSegment,
  DamageType,
  FixedProficiencyGrant,
  RuntimeModifier,
  WeaponDefinition,
} from "@project/shared";
import { AbilityEngine } from "./abilities.js";
import type { Ability } from "../types/core.js";
import type { WeaponAttackContext } from "../types/combat.js";
import { DiceEngine } from "../utils/diceParser.js";

/**
 * Whether the d20 for this attack is rolled twice, and which half counts.
 *
 * "normal" covers both the ordinary case and the 5e rule that any amount of
 * advantage cancels against any amount of disadvantage; the breakdown says
 * which of the two happened.
 */
export type AttackRollState = "advantage" | "disadvantage" | "normal";

/**
 * The value a `class_level_thresholds` block resolves to at a given level.
 *
 * Shared by the damage-bonus path and the critical-dice path, which want the
 * same answer from the same authored shape; two copies in one file would drift.
 * Resolves to zero below the first threshold - a rule that has not come online
 * yet contributes nothing rather than its lowest tier.
 *
 * (`DerivedStatEngine.resolveScaledValue` still carries its own copy of this
 * reduce; unifying the three is a separate tidy-up.)
 */
interface ClassLevelScaling {
  scalingClassId?: string | undefined;
  scalingThresholds?: RuntimeModifier["scalingThresholds"];
}

const resolveClassLevelThresholds = (
  scaling: ClassLevelScaling,
  classLevels: Record<string, number>,
): number => {
  const classLevel = classLevels[scaling.scalingClassId ?? ""] ?? 0;

  return (scaling.scalingThresholds ?? []).reduce(
    (resolved, threshold) =>
      classLevel >= threshold.minimumLevel ? threshold.value : resolved,
    0,
  );
};

export interface DerivedAttack {
  weaponId: string;
  name: string;
  attackBonus: number;
  rollState: AttackRollState;
  damageBonus: number;
  damageExpression: string; // e.g., '1d8 + 4'
  criticalDamageExpression: string; // e.g., '2d8 + 4'
  /**
   * The pools behind the two expressions above.
   *
   * The strings are what the sheet and the socket contract display; these are
   * what gets rolled. Segments keep each die's own damage type and source,
   * which a flattened `NdX` string cannot - so a mixed-type critical, a rider
   * with its own die size, or a breakdown that names the trait that granted a
   * die, all need these rather than the text.
   */
  damageSegments: DamageSegment[];
  criticalDamage: DamageSegment[];
  criticalDamageMaximized: boolean;
  /** The classification the critical-hit modifiers were matched against. */
  attackType: "melee_weapon" | "ranged_weapon" | "melee_spell" | "ranged_spell";
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
   * The states an attack knows about itself.
   *
   * A rule like Rage or Reckless Attack is gated on the *kind* of attack being
   * made - melee, and governed by Strength - but only this calculation knows
   * which weapon and which ability actually resolved. Deriving the states here
   * rather than asking the caller for them is what lets that authored data
   * gate correctly without the sheet having to guess ahead of the swing.
   *
   * Local to one attack on purpose: they join the gating list for this call and
   * never reach the character's activeStates, because "currently making a melee
   * attack" is not true of the character between attacks.
   * @param attackType The resolved classification of this attack
   * @param statName The ability that ended up governing the attack
   * @returns The context states this attack satisfies
   */
  private static deriveAttackContextStates(
    attackType:
      | "melee_weapon"
      | "ranged_weapon"
      | "melee_spell"
      | "ranged_spell",
    statName: Ability,
  ): string[] {
    const isMelee =
      attackType === "melee_weapon" || attackType === "melee_spell";

    return [
      isMelee ? "action_melee_attack" : "action_ranged_attack",
      `action_using_${statName.toLowerCase()}`,
    ];
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

    // optional-chained like requiredStates and forbiddenStates above: the
    // schema defaults this to [], but a dictionary literal that was never
    // parsed can still reach here without it
    if (!modifier.requiredAttackTypes?.length) {
      return true; // no specific attack type required
    }

    // check if the attack type matches any of the required attack types
    return modifier.requiredAttackTypes.includes(attackType);
  }

  /**
   * Doubles a segment's dice count, which is what a critical hit does to every
   * damage die the attack was already rolling - the weapon's and any rider's.
   *
   * A segment whose `baseDice` will not parse is passed through untouched
   * rather than dropped: authored data that the dice engine cannot read is
   * still damage someone meant to deal.
   * @param segment The damage segment to double
   * @returns The segment with twice as many dice
   */
  private static doubleSegment(segment: DamageSegment): DamageSegment {
    try {
      const { count, sides } = DiceEngine.parse(segment.baseDice);
      return { ...segment, baseDice: `${count * 2}d${sides}` };
    } catch {
      return segment;
    }
  }

  /**
   * Applies one critical hit modifier to the critical damage pool.
   *
   * `add_base_die` grows the weapon's own die, which is segment zero -
   * `WeaponSynthesizer` always emits the weapon ahead of any rider, the same
   * invariant `ActionResolver` leans on when it attaches the flat damage bonus
   * to `index === 0`.
   *
   * `add_specific_die` appends a *new* segment. It is not doubled: it is
   * already extra damage that only exists because the attack crit. Appending
   * rather than substituting is the fix for the backlog entry that named this
   * method - the old code returned `diceToAdd` alone and discarded the weapon.
   * @param segments The critical damage pool so far
   * @param modifier The critical hit modifier being applied
   * @param classLevels Levels per class, for a `class_level_thresholds` count
   * @param fallbackDamageType The weapon's damage type, for an untyped rider
   * @returns A new pool reflecting the applied modifier
   */
  private static applyCriticalHitModifier(
    segments: DamageSegment[],
    modifier: CriticalHitModifier,
    classLevels: Record<string, number> = {},
    fallbackDamageType?: DamageType,
  ): DamageSegment[] {
    if (modifier.type === "add_base_die") {
      // `?? 1` rather than trusting the schema default: a modifier can reach
      // here from a static dictionary literal that was never parsed, and an
      // undefined count would put NaN into the damage expression
      const extraDice =
        modifier.scalingFactor === "class_level_thresholds"
          ? resolveClassLevelThresholds(modifier, classLevels)
          : (modifier.dieCount ?? 1);

      // a threshold rule the character has not reached yet resolves to zero,
      // which must leave the pool alone rather than reformat it
      if (extraDice <= 0) return segments;

      const weaponSegment = segments[0];
      if (!weaponSegment) return segments;

      try {
        const { count, sides } = DiceEngine.parse(weaponSegment.baseDice);
        return [
          { ...weaponSegment, baseDice: `${count + extraDice}d${sides}` },
          ...segments.slice(1),
        ];
      } catch {
        return segments;
      }
    }

    if (modifier.type === "add_specific_die" && modifier.diceToAdd) {
      return [
        ...segments,
        {
          sourceName: modifier.sourceName ?? "Critical Hit",
          baseDice: modifier.diceToAdd,
          damageType:
            modifier.damageType ?? fallbackDamageType ?? "bludgeoning",
          scalingMode: "none",
          levelScaling: [],
        },
      ];
    }

    // if the modifier type is unrecognized, return the pool unchanged
    return segments;
  }

  /**
   * Formats a damage pool into the single string the sheet and the socket
   * contract still speak.
   *
   * Segments are grouped by damage type in first-appearance order, and dice of
   * the same size within a type are merged, so a weapon die and a rider that
   * happens to match it read as one pool rather than as two terms. The flat
   * damage bonus attaches to the first group only - the weapon's - matching how
   * `ActionResolver` applies it to `index === 0` when the dice are actually
   * rolled.
   * @param segments The damage pool to render
   * @param totalDamageBonus The flat bonus to attach to the weapon's group
   * @returns A formatted expression (e.g., "3d12 +4 slashing + 1d6 fire")
   */
  private static formatDamageExpression(
    segments: DamageSegment[],
    totalDamageBonus: number,
  ): string {
    const groups = new Map<string, Map<number, number>>();

    for (const segment of segments) {
      let diceBySides = groups.get(segment.damageType);
      if (!diceBySides) {
        diceBySides = new Map<number, number>();
        groups.set(segment.damageType, diceBySides);
      }

      try {
        const { count, sides } = DiceEngine.parse(segment.baseDice);
        diceBySides.set(sides, (diceBySides.get(sides) ?? 0) + count);
      } catch {
        // an unparseable segment contributes no dice rather than corrupting the
        // whole expression
      }
    }

    const rendered = [...groups.entries()]
      .map(([damageType, diceBySides], index) => {
        const dice = [...diceBySides.entries()]
          .map(([sides, count]) => `${count}d${sides}`)
          .join(" + ");

        // only the weapon's group carries the flat bonus
        const bonus =
          index === 0 && totalDamageBonus !== 0
            ? ` ${totalDamageBonus > 0 ? "+" : ""}${totalDamageBonus}`
            : "";

        return `${dice}${bonus} ${damageType}`;
      })
      .filter((group) => !group.startsWith(" "));

    return rendered.join(" + ");
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
      return resolveClassLevelThresholds(modifier, classLevels);
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

    // this attack's own classification, resolved before the modifier filter so
    // the states it implies can gate that filter
    const resolvedAttackType = attackType ?? this.inferAttackType(weapon);

    // what the character carries, plus what this particular swing is
    const gatingStates = [
      ...activeStates,
      ...this.deriveAttackContextStates(resolvedAttackType, statName),
    ];

    // filter active modifiers for this specific attack
    const validMods = modifiers.filter((m) => {
      if (!m.isActive) return false;
      if (m.forbiddenStates?.some((s) => gatingStates.includes(s))) return false;
      return m.requiredStates
        ? m.requiredStates.every((s) => gatingStates.includes(s))
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

    // 3b - resolve the roll state. This changes no total: advantage is a second
    // d20, not a bonus, so it is reported alongside the number rather than
    // folded into it.
    const advantageSource = validMods.find(
      (m) => m.target === "ATTACK_BONUS" && m.type === "advantage",
    );
    const disadvantageSource = validMods.find(
      (m) => m.target === "ATTACK_BONUS" && m.type === "disadvantage",
    );

    let rollState: AttackRollState = "normal";

    if (advantageSource && !disadvantageSource) {
      rollState = "advantage";
      attackBreakdown.push(
        `Advantage (Granted by ${advantageSource.sourceName})`,
      );
    } else if (disadvantageSource && !advantageSource) {
      rollState = "disadvantage";
      attackBreakdown.push(
        `Disadvantage (Imposed by ${disadvantageSource.sourceName})`,
      );
    } else if (advantageSource && disadvantageSource) {
      attackBreakdown.push("Straight Roll (Advantage/Disadvantage cancel out)");
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

    // the weapon's own dice, and the only segment CombatEngine authors: riders
    // reach the roll as their own actions, and join the pool downstream
    const damageSegments: DamageSegment[] = [
      {
        sourceName: weapon.name,
        baseDice: finalDice ?? weapon.damageDice,
        damageType: weapon.damageType,
        scalingMode: "none",
        levelScaling: [],
      },
    ];

    // a critical hit rolls every damage die twice before any modifier speaks
    let criticalDamage = damageSegments.map((segment) =>
      this.doubleSegment(segment),
    );
    let criticalDamageMaximized = false;

    for (const modifier of criticalHitModifiers) {
      if (
        !this.matchesCriticalHitModifier(
          modifier,
          resolvedAttackType,
          gatingStates,
        )
      ) {
        continue;
      }

      if (modifier.type === "maximize_dice") {
        criticalDamageMaximized = true;
        continue;
      }

      criticalDamage = this.applyCriticalHitModifier(
        criticalDamage,
        modifier,
        classLevels,
        weapon.damageType,
      );
    }

    // carried on the segments themselves so a maximized rider can sit beside
    // ordinary weapon dice; the flag stays on the return value for the sheet
    if (criticalDamageMaximized) {
      criticalDamage = criticalDamage.map((segment) => ({
        ...segment,
        maximized: true,
      }));
    }

    // a known critical resolves its damage from the critical pool
    const resolvedDamage = isCriticalHit ? criticalDamage : damageSegments;

    // format the final damage expressions for both normal and critical hits
    const damageExpression = this.formatDamageExpression(
      resolvedDamage,
      totalDamageBonus,
    );
    const criticalDamageExpression = this.formatDamageExpression(
      criticalDamage,
      totalDamageBonus,
    );

    return {
      weaponId: weapon.id,
      name: weapon.name,
      attackBonus,
      rollState,
      damageBonus: totalDamageBonus,
      damageExpression,
      criticalDamageExpression,
      damageSegments,
      criticalDamage,
      criticalDamageMaximized,
      // the classification the critical-hit modifiers were matched against, so
      // a caller holding several actions for one weapon - a thrown dagger's
      // melee and ranged swings - can tell which of them this pool describes
      attackType: resolvedAttackType,
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
