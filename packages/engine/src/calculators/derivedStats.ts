import type { CalculationResult, RuntimeModifier } from "@project/shared";

export class DerivedStatEngine {
  public static calculateMaxHp(
    baseHpRolled: number,
    conModifier: number,
    totalLevel: number,
    modifiers: RuntimeModifier[],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];

    // 5e hp rule: base + (con * level)
    // min 1 hp granted per lvl regardless of negative con mod
    const conContribution = Math.max(1, conModifier) * totalLevel;
    let total = baseHpRolled + conContribution;

    breakdown.push({ name: "Base HP Rolled", value: baseHpRolled });
    breakdown.push({
      name: `CON (${conModifier}) x Level (${totalLevel})`,
      value: conContribution,
    });

    const hpMods = modifiers.filter((m) => m.target === "MAX_HP" && m.isActive);

    // process trait mods
    for (const mod of hpMods) {
      if (mod.type === "add") {
        total += mod.value;
        breakdown.push({ name: mod.sourceName, value: `+${mod.value}` });
      }
    }

    return { total, breakdown };
  }

  public static calculateAC(
    baseDexMod: number,
    modifiers: RuntimeModifier[],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];
    const activeMods = modifiers.filter(
      (m) => m.target === "ARMOR_CLASS" && m.isActive,
    );

    // 1 - determine base AC (handling mutually exclusive formulas)
    // engine sorts 'set_base' mods to find the highest available formula
    const baseSetters = activeMods.filter((m) => m.type === "set_base");
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
    const adders = activeMods.filter((m) => m.type === "add");
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

  public static calculateInitiative(
    baseDexMod: number,
    modifiers: RuntimeModifier[],
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];
    let total = baseDexMod;

    // 1 - base dexterity
    const dexSign = baseDexMod >= 0 ? "+" : "";
    breakdown.push({
      name: "Dexterity Modifier",
      value: `${dexSign}${baseDexMod}`,
    });

    const activeMods = modifiers.filter(
      (m) => m.target === "INITIATIVE" && m.isActive,
    );

    // 2 - flat additions
    const adders = activeMods.filter((m) => m.type === "add");
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
      total += mod.value;

      const modSign = mod.value >= 0 ? "+" : "";
      breakdown.push({ name: mod.sourceName, value: `${modSign}${mod.value}` });
    }

    // 3- roll state flags (advantage / disadvantage)
    // these don't change the numerical total, but are good for UI breakdown
    const hasAdvantage = activeMods.some((m) => m.type === "advantage");
    const hasDisadvantage = activeMods.some((m) => m.type === "disadvantage");

    if (hasAdvantage && !hasDisadvantage) {
      const source = activeMods.find((m) => m.type === "advantage")?.sourceName;
      breakdown.push({ name: "Advantage", value: `Granted by ${source}` });
    } else if (hasDisadvantage && !hasAdvantage) {
      const source = activeMods.find(
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
}
