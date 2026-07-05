import { TRAIT_DICTIONARY } from "../rules/traitDictionary.js";
import type { Modifier } from "../types/engine.js";

export interface CalculationResult {
  total: number;
  breakdown: Array<{
    name: string;
    value: number | string;
    isIgnored?: boolean;
  }>;
}

export class DerivedStatEngine {
  public static calculateAC(
    baseDexMod: number,
    modifiers: Modifier[],
  ): CalculationResult {
    const activeMods = modifiers.filter((m) => m.target === "AC" && m.isActive);

    const breakdown: CalculationResult["breakdown"] = [];

    // 1 - determine base AC (handling mutually exclusive formulas)
    // engine sorts 'set_base' mods to find the highest available formula
    const baseSetters = activeMods.filter((m) => m.type === "set_base");
    let baseAc = 10;

    if (baseSetters.length > 0) {
      // find highest base base setting armor/trait (e.g., plate > mage armor)
      const bestBase = baseSetters.reduce((prev, current) =>
        prev.value > current.value ? prev : current,
      );
      baseAc = bestBase.value;

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

    // 2- apply additions (handling duplicate names)
    const adders = activeMods.filter((m) => m.type === "add");
    let addedBonus = 0;
    const appliedNames = new Set<string>();

    for (const mod of adders) {
      // prevent stacking from identical sources (e.g., 2x Rings of Protection)
      if (appliedNames.has(mod.sourceName)) {
        breakdown.push({
          name: mod.sourceName,
          value: `Ignored (Duplicate)`,
          isIgnored: true,
        });
        continue;
      }

      appliedNames.add(mod.sourceName);
      addedBonus += mod.value;
      breakdown.push({ name: mod.sourceName, value: `+${mod.value}` });
    }

    // 3 - dex rules (TODO check armor max-dex rules here)
    const finalDex = baseDexMod; // SIMPLIFIED TODO FIX THIS
    breakdown.push({ name: "Dexterity Modifier", value: `+${finalDex}` });

    return {
      total: baseAc + finalDex + addedBonus,
      breakdown,
    };
  }

  public static calculateProficiencyBonus(totalLevel: number): number {
    return Math.ceil(totalLevel / 4) + 1;
  }

  public static calculateMaxHp(
    baseHpRolled: number,
    conModifier: number,
    totalLevel: number,
    activeTraitIds: string[],
    primaryClassLevel: number = totalLevel,
  ): number {
    // 5e hp rule: base + (con * level)
    // min 1 hp granted per lvl regardless of negative con mod
    const conContribution = Math.max(1, conModifier) * totalLevel;
    let maxHp = baseHpRolled + conContribution;

    // process trait mods
    for (const traitId of activeTraitIds) {
      const trait = TRAIT_DICTIONARY[traitId];
      if (!trait) continue;

      for (const mod of trait.modifiers) {
        if (mod.target === "MAX_HP") {
          let modValue = mod.value;
          if (mod.scalingFactor === "total_level") modValue *= totalLevel;
          if (mod.scalingFactor === "class_level")
            modValue *= primaryClassLevel;
          if (mod.type === "flat") maxHp += modValue;
        }
      }
    }

    return maxHp;
  }

  public static calculateInitiative(
    dexModifier: number,
    activeTraitIds: string[],
  ): number {
    let initiative = dexModifier;

    for (const traitId of activeTraitIds) {
      const trait = TRAIT_DICTIONARY[traitId];
      if (!trait) continue;

      for (const mod of trait.modifiers) {
        if (mod.target === "INITIATIVE" && mod.type === "flat") {
          initiative += mod.value;
        }
      }
    }

    return initiative;
  }
}
