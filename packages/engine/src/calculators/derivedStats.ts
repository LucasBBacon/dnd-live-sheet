import type {
  CalculationResult,
  FixedProficiencyGrant,
  RuntimeModifier,
} from "@project/shared";
import type { Ability } from "../types/core.js";

export interface LevelProfile {
  total: number;
  classes: Record<string, number>; // e.g., {rogue: 3, sorcerer: 2}
}

const PROFICIENCY_MULTIPLIERS: Record<string, number> = {
  none: 0,
  half: 0.5,
  proficient: 1,
  expertise: 2,
};

/**
 * The DerivedStatEngine class provides static methods to calculate derived character statistics such as maximum hit points (HP), armor class (AC), and initiative.
 * These calculations take into account base values, ability modifiers, and active runtime modifiers from various sources (e.g., items, traits).
 * The engine generates a detailed breakdown of the calculations for transparency and debugging purposes.
 */
export class DerivedStatEngine {
  // #region Max HP

  /**
   * Calculates the maximum hit points (HP) for a character based on base HP rolled, constitution modifier, total level, and active runtime modifiers.
   * @param baseHpRolled The base hit points rolled for the character (e.g., from class hit dice).
   * @param conModifier The character's constitution ability modifier, which contributes to HP based on total level.
   * @param totalLevel The character's total level, used to calculate the contribution of the constitution modifier to HP.
   * @param modifiers An array of RuntimeModifier objects representing active modifiers that can affect the maximum HP calculation (e.g., from items, traits).
   * @returns A CalculationResult object containing the total calculated maximum HP and a breakdown of the contributing factors for transparency.
   * @throws An error if any of the input parameters are invalid or if the calculation cannot be completed.
   */
  public static calculateMaxHp(
    baseHpRolled: number,
    conModifier: number,
    levels: LevelProfile,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];

    // 5e hp rule: base + (con * level)
    // min 1 hp granted per lvl regardless of negative con mod
    const conContribution = Math.max(1, conModifier) * levels.total;
    let total = baseHpRolled + conContribution;

    breakdown.push({ name: "Base HP Rolled", value: baseHpRolled });
    breakdown.push({
      name: `CON (${conModifier >= 0 ? "+" : ""}${conModifier}) x Level (${levels.total})`,
      value: conContribution,
    });

    const hpMods = modifiers.filter((m) => {
      if (m.target !== "MAX_HP" || !m.isActive) {
        return false;
      }
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    // process trait mods
    for (const mod of hpMods) {
      if (mod.type === "add") {
        // handle scaling based on ModifierScalingSchema
        const addition = this.resolveScaledValue(mod, levels);

        if (addition !== 0) {
          total += addition;
          const sign = addition >= 0 ? "+" : "";
          breakdown.push({ name: mod.sourceName, value: `${sign}${addition}` });
        }
      }
    }

    return { total, breakdown };
  }

  // #endregion

  // #region Attacks per action

  /**
   * How many attacks one Attack action grants.
   *
   * Base one, because a character who has never heard of Extra Attack still
   * swings once. Candidates compete rather than sum: Extra Attack explicitly
   * does not stack, so a Fighter 11 / Barbarian 5 attacks three times, not
   * five. Highest candidate wins and the rest are reported as ignored, the same
   * way calculateAC explains a rejected base.
   *
   * This is the count only. Nothing here tracks how many attacks have been
   * used - the sheet has no turn lifecycle to reset such a counter against.
   * @param modifiers Active runtime modifiers, of which ATTACKS_PER_ACTION set_base entries are candidates
   * @param levels The character's total and per-class levels, for threshold scaling
   * @param activeStates Flat array of all active states affecting the character
   * @returns The resolved attack count with a breakdown naming the winner and any ignored candidates
   */
  public static calculateAttacksPerAction(
    modifiers: RuntimeModifier[],
    levels: LevelProfile,
    activeStates: string[] = [],
  ): CalculationResult {
    const BASE_ATTACKS = 1;

    const candidates = modifiers
      .filter((mod) => {
        if (!mod.isActive) return false;
        if (mod.target !== "ATTACKS_PER_ACTION") return false;
        if (mod.type !== "set_base") return false;
        if (mod.forbiddenStates?.some((s) => activeStates.includes(s))) {
          return false;
        }
        return mod.requiredStates
          ? mod.requiredStates.every((s) => activeStates.includes(s))
          : true;
      })
      .map((mod) => ({
        sourceName: mod.sourceName,
        value: this.resolveScaledValue(mod, levels),
      }))
      // a threshold nobody has reached yet resolves to zero, which is not a
      // candidate at all rather than a candidate of zero attacks
      .filter((candidate) => candidate.value > BASE_ATTACKS)
      .sort((left, right) => right.value - left.value);

    const winner = candidates[0];

    if (!winner) {
      return {
        total: BASE_ATTACKS,
        breakdown: [{ name: "Attack action", value: BASE_ATTACKS }],
      };
    }

    return {
      total: winner.value,
      breakdown: [
        { name: winner.sourceName, value: winner.value },
        ...candidates.slice(1).map((candidate) => ({
          name: candidate.sourceName,
          value: "Ignored (Does not stack)",
          isIgnored: true,
        })),
      ],
    };
  }

  /**
   * The value a modifier resolves to once its scaling rule is applied.
   *
   * Extracted because calculateMaxHp reasons about class-level thresholds the
   * same way; keeping one copy means a threshold fix cannot land in only half
   * of the calculator.
   * @param modifier The runtime modifier being resolved
   * @param levels The character's total and per-class levels
   * @returns The scaled value, or 0 when no threshold has been reached
   */
  private static resolveScaledValue(
    modifier: RuntimeModifier,
    levels: LevelProfile,
  ): number {
    if (modifier.scalingFactor === "total_level") {
      return modifier.value * levels.total;
    }

    if (modifier.scalingFactor === "class_level" && modifier.scalingClassId) {
      return modifier.value * (levels.classes[modifier.scalingClassId] ?? 0);
    }

    if (
      modifier.scalingFactor === "class_level_thresholds" &&
      modifier.scalingClassId
    ) {
      const classLevel = levels.classes[modifier.scalingClassId] ?? 0;
      return (modifier.scalingThresholds ?? []).reduce(
        (resolved, threshold) =>
          classLevel >= threshold.minimumLevel ? threshold.value : resolved,
        0,
      );
    }

    return modifier.value;
  }

  // #endregion

  // #region AC

  /**
   * Calculates the armor class (AC) for a character based on base dexterity modifier and active runtime modifiers that affect AC.
   * @param baseDexMod The character's base Dexterity modifier, which contributes to the AC calculation.
   * @param modifiers An array of RuntimeModifier objects representing active modifiers that can affect the AC calculation (e.g., from items, traits).
   * @returns A CalculationResult object containing the total calculated AC and a breakdown of the contributing factors for transparency.
   * @throws An error if any of the input parameters are invalid or if the calculation cannot be completed.
   */
  public static calculateAC(
    abilityModifiersOrDex: Record<Ability, number> | number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];
    const abilityModifiers: Record<Ability, number> =
      typeof abilityModifiersOrDex === "number"
        ? {
            STR: 0,
            DEX: abilityModifiersOrDex,
            CON: 0,
            INT: 0,
            WIS: 0,
            CHA: 0,
          }
        : abilityModifiersOrDex;

    const validMods = modifiers.filter((m) => {
      if (m.target !== "ARMOR_CLASS" || !m.isActive) {
        return false;
      }
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    // 1 - determine base AC (handling mutually exclusive formulas)
    // engine sorts 'set_base' mods to find the highest available formula
    const baseSetters = validMods.filter((m) => m.type === "set_base");
    let baseAc = 10;
    let dexCap: number | undefined = undefined;
    let bestBase: RuntimeModifier | undefined;

    if (baseSetters.length > 0) {
      // 5e rule - if multiple ways to calculate base AC use highest
      // find highest base base setting armor/trait (e.g., plate > mage armor)
      const winner = baseSetters.reduce((prev, current) => {
        const prevTotal = this.getBaseCandidateTotal(prev, abilityModifiers);
        const currTotal = this.getBaseCandidateTotal(current, abilityModifiers);
        return prevTotal >= currTotal ? prev : current;
      });
      bestBase = winner;

      baseAc = winner.formula?.base ?? winner.value;
      dexCap = winner.maxDexCap;

      breakdown.push({
        name: `Base AC (${winner.sourceName})`,
        value: winner.value,
      });

      // mark others as ignored for the UI to explain WHY they aren't working
      baseSetters.forEach((m) => {
        if (m.id !== winner.id)
          breakdown.push({
            name: m.sourceName,
            value: "Ignored (Does not stack)",
            isIgnored: true,
          });
      });
    } else {
      breakdown.push({ name: "Base AC (Unarmored)", value: 10 });
    }

    // 2 - evaluate dexterity contribution
    const baseDexMod = abilityModifiers.DEX;
    let finalDex = bestBase?.formula ? 0 : baseDexMod;
    let dexLabel = "Dexterity Modifier";

    if (dexCap !== undefined) {
      if (dexCap === 0) {
        // Heavy Armor RAW: do not add DEX, and do not take penalties for negative DEX
        finalDex = 0;
        dexLabel = "Dexterity (Heavy Armor)";
      } else if (baseDexMod > dexCap) {
        // Medium Armor RAW: capped at max (usually +2), but negative DEX still applies
        finalDex = dexCap;
        dexLabel = `Dexterity (Capped at +${dexCap})`;
      }
    }

    if (finalDex !== 0 || dexCap === 0) {
      const sign = finalDex > 0 ? "+" : "";
      // explicitly show +0 for heavy armor so user knows it was processed
      breakdown.push({
        name: dexLabel,
        value: dexCap === 0 ? "+0" : `${sign}${finalDex}`,
      });
    }

    // 3 - flat additions
    const adders = validMods.filter((m) => m.type === "add");
    let addedBonus = 0;

    const appliedNames = new Set<string>();
    for (const mod of adders) {
      if (appliedNames.has(mod.sourceName)) {
        breakdown.push({
          name: mod.sourceName,
          value: "Ignored (Duplicate)",
          isIgnored: true,
        });
        continue;
      }
      appliedNames.add(mod.sourceName);
      addedBonus += mod.value;

      const sign = mod.value >= 0 ? "+" : "";
      breakdown.push({ name: mod.sourceName, value: `${sign}${mod.value}` });
    }

    if (bestBase?.formula) {
      for (const ability of bestBase.formula.abilities) {
        const modifier = abilityModifiers[ability];
        const sign = modifier >= 0 ? "+" : "";
        const abilityName =
          ability === "DEX"
            ? "Dexterity"
            : ability === "CON"
              ? "Constitution"
              : ability;
        breakdown.push({
          name: `${abilityName} Modifier`,
          value: `${sign}${modifier}`,
        });
        addedBonus += modifier;
      }
    }

    return {
      total: baseAc + finalDex + addedBonus,
      breakdown,
    };
  }

  private static getBaseCandidateTotal(
    modifier: RuntimeModifier,
    abilityModifiers: Record<Ability, number>,
  ): number {
    if (modifier.formula) {
      return modifier.formula.base + modifier.formula.abilities.reduce(
        (total, ability) => total + abilityModifiers[ability],
        0,
      );
    }

    return modifier.value + Math.min(
      abilityModifiers.DEX,
      modifier.maxDexCap ?? Infinity,
    );
  }

  // #endregion

  // #region Initiative

  /**
   * Calculates the initiative modifier for a character based on their base Dexterity modifier and any active runtime modifiers that affect initiative rolls.
   * @param baseDexMod The character's base Dexterity modifier, which contributes to the initiative calculation.
   * @param modifiers An array of RuntimeModifier objects representing active modifiers that can affect the initiative calculation (e.g., from items, traits).
   * @returns A CalculationResult object containing the total calculated initiative modifier and a breakdown of the contributing factors for transparency.
   * @throws An error if any of the input parameters are invalid or if the calculation cannot be completed.
   */
  public static calculateInitiative(
    baseDexMod: number,
    profBonus: number,
    proficiencies: FixedProficiencyGrant[],
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];
    let total = baseDexMod;

    // 1 - base dexterity
    const dexSign = baseDexMod >= 0 ? "+" : "";
    breakdown.push({
      name: "Dexterity Modifier",
      value: `${dexSign}${baseDexMod}`,
    });

    // determine initiative prof
    // treat initiative as valid proficiencyId in engine
    const relevantGrants = proficiencies.filter(
      (p) => p.category === "skills" && p.proficiencyId === "initiative",
    );

    let maxMultiplier = 0;
    for (const grant of relevantGrants) {
      const meetsRequirements = grant.requiredStates
        ? grant.requiredStates.every((state) => activeStates.includes(state))
        : true;

      if (meetsRequirements) {
        const multiplier = PROFICIENCY_MULTIPLIERS[grant.level] ?? 0;
        if (multiplier > maxMultiplier) {
          maxMultiplier = multiplier;
        }
      }
    }

    if (maxMultiplier > 0) {
      const appliedProf = Math.floor(profBonus * maxMultiplier);
      total += appliedProf;
      breakdown.push({
        name: `Proficiency (x${maxMultiplier})`,
        value: `+${appliedProf}`,
      });
    }

    const validMods = modifiers.filter((m) => {
      if (m.target !== "INITIATIVE" || !m.isActive) {
        return false;
      }
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    // 2 - flat additions
    const adders = validMods.filter((m) => m.type === "add");
    const groupedAdders = new Map<string, RuntimeModifier[]>();

    for (const mod of adders) {
      if (!groupedAdders.has(mod.sourceName)) {
        groupedAdders.set(mod.sourceName, []);
      }
      groupedAdders.get(mod.sourceName)!.push(mod);
    }

    for (const [sourceName, mods] of groupedAdders.entries()) {
      // sort descending to grab highest value buff of this name
      mods.sort((a, b) => b.value - a.value);

      if (mods.length === 0) continue;

      const bestMod = mods[0];
      if (!bestMod) continue;

      total += bestMod.value;
      const modSign = bestMod.value >= 0 ? "+" : "";
      breakdown.push({ name: sourceName, value: `${modSign}${bestMod.value}` });

      // mark the weaker duplicates as ignored
      for (let i = 1; i < mods.length; i++) {
        breakdown.push({
          name: sourceName,
          value: "Ignored (Does not stack)",
          isIgnored: true,
        });
      }
    }

    // 3- roll state flags (advantage / disadvantage)
    // these don't change the numerical total, but are good for UI breakdown
    const hasAdvantage = validMods.some((m) => m.type === "advantage");
    const hasDisadvantage = validMods.some((m) => m.type === "disadvantage");

    if (hasAdvantage && !hasDisadvantage) {
      const source = validMods.find((m) => m.type === "advantage")?.sourceName;
      breakdown.push({ name: "Advantage", value: `Granted by ${source}` });
    } else if (hasDisadvantage && !hasAdvantage) {
      const source = validMods.find(
        (m) => m.type === "disadvantage",
      )?.sourceName;
      breakdown.push({ name: "Disadvantage", value: `Imposed by ${source}` });
    } else if (hasAdvantage && hasDisadvantage) {
      breakdown.push({
        name: "Straight Roll",
        value: `Advantage/Disadvantage cancel out`,
      });
    }

    return {
      total,
      breakdown,
    };
  }
  // #endregion
}
