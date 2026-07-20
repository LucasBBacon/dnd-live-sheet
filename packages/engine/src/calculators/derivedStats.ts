import type {
  CalculationResult,
  FixedProficiencyGrant,
  RuntimeModifier,
} from "@project/shared";

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
        let addition = mod.value;

        // handle scaling based on ModifierScalingSchema
        if (mod.scalingFactor === "total_level") {
          addition *= levels.total;
        } else if (mod.scalingFactor === "class_level" && mod.scalingClassId) {
          const classLvl = levels.classes[mod.scalingClassId] || 0;
          addition *= classLvl;
        }

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

  // #region AC

  /**
   * Calculates the armor class (AC) for a character based on base dexterity modifier and active runtime modifiers that affect AC.
   * @param baseDexMod The character's base Dexterity modifier, which contributes to the AC calculation.
   * @param modifiers An array of RuntimeModifier objects representing active modifiers that can affect the AC calculation (e.g., from items, traits).
   * @returns A CalculationResult object containing the total calculated AC and a breakdown of the contributing factors for transparency.
   * @throws An error if any of the input parameters are invalid or if the calculation cannot be completed.
   */
  public static calculateAC(
    baseDexMod: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];

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

    if (baseSetters.length > 0) {
      // 5e rule - if multiple ways to calculate base AC use highest
      // find highest base base setting armor/trait (e.g., plate > mage armor)
      const bestBase = baseSetters.reduce((prev, current) => {
        const prevTotal =
          prev.value + Math.min(baseDexMod, prev.maxDexCap ?? Infinity);
        const currTotal =
          current.value + Math.min(baseDexMod, current.maxDexCap ?? Infinity);
        return prevTotal >= currTotal ? prev : current;
      });

      baseAc = bestBase.value;
      dexCap = bestBase.maxDexCap;

      breakdown.push({
        name: `Base AC (${bestBase.sourceName})`,
        value: bestBase.value,
      });

      // mark others as ignored for the UI to explain WHY they aren't working
      baseSetters.forEach((m) => {
        if (m.id !== bestBase.id)
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
    let finalDex = baseDexMod;
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

    return {
      total: baseAc + finalDex + addedBonus,
      breakdown,
    };
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
      const bestMod = mods[0];

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
