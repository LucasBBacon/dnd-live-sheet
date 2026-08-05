import type { CalculationResult, RuntimeModifier } from "@project/shared";
import type { EncumbranceTier } from "./encumbrance.js";

/**
 * What speed drops to once a character is carrying more than they can.
 *
 * RAW simply says you cannot exceed your capacity and stops there, so this is
 * a table ruling written down rather than a rule from the book. It is a named
 * constant so it is obvious where to change it.
 */
export const OVER_CAPACITY_SPEED = 5;

/** over_capacity is an override rather than a penalty, so it subtracts nothing. */
const TIER_PENALTY: Record<EncumbranceTier, number> = {
  none: 0,
  encumbered: 10,
  heavily_encumbered: 20,
  over_capacity: 0,
};

const TIER_LABEL: Record<EncumbranceTier, string> = {
  none: "",
  encumbered: "Encumbered",
  heavily_encumbered: "Heavily Encumbered",
  over_capacity: "Over Capacity",
};

/**
 * Turns a racial walking speed, the modifiers acting on it, and how loaded
 * down the character is into a final speed with a breakdown.
 *
 * Order is load-bearing and matches how a table adjudicates it: establish the
 * base, take the best override, apply flat bonuses, subtract encumbrance, then
 * multiply. Dash doubles the speed you can actually manage while loaded, not
 * the speed you would have had with an empty pack.
 */
export class SpeedEngine {
  public static calculateSpeed(
    baseSpeed: number,
    modifiers: RuntimeModifier[],
    activeStates: string[] = [],
    encumbranceTier: EncumbranceTier = "none",
  ): CalculationResult {
    const breakdown: CalculationResult["breakdown"] = [];

    const validMods = modifiers.filter((m) => {
      if (m.target !== "SPEED" || !m.isActive) {
        return false;
      }
      if (m.forbiddenStates?.some((s) => activeStates.includes(s))) {
        return false;
      }
      return m.requiredStates
        ? m.requiredStates.every((s) => activeStates.includes(s))
        : true;
    });

    // 1 - base walking speed, or the best override on offer. mirrors
    // calculateAC: several ways to set a base do not stack, the highest wins
    let total = baseSpeed;
    breakdown.push({ name: "Base Speed", value: baseSpeed });

    const setters = validMods.filter((m) => m.type === "set_base");

    if (setters.length > 0) {
      const best = setters.reduce((prev, current) =>
        prev.value >= current.value ? prev : current,
      );

      // an override only helps if it beats the speed the race already grants,
      // so 30ft boots do nothing for a 35ft elf
      if (best.value > total) {
        total = best.value;
        breakdown.push({ name: best.sourceName, value: best.value });
      }

      for (const setter of setters) {
        const applied = setter.id === best.id && best.value > baseSpeed;

        if (!applied) {
          breakdown.push({
            name: setter.sourceName,
            value: "Ignored (Does not stack)",
            isIgnored: true,
          });
        }
      }
    }

    // 2 - flat bonuses and penalties
    for (const mod of validMods.filter((m) => m.type === "add")) {
      total += mod.value;
      const sign = mod.value >= 0 ? "+" : "";
      breakdown.push({ name: mod.sourceName, value: `${sign}${mod.value}` });
    }

    // 3 - encumbrance, before multipliers so Dash doubles the loaded speed
    const penalty = TIER_PENALTY[encumbranceTier];

    if (penalty > 0) {
      total -= penalty;
      breakdown.push({
        name: TIER_LABEL[encumbranceTier],
        value: `-${penalty}`,
      });
    }

    // 4 - multipliers (Dash, Haste)
    for (const mod of validMods.filter((m) => m.type === "multiplier")) {
      total *= mod.value;
      breakdown.push({ name: mod.sourceName, value: `x${mod.value}` });
    }

    // 5 - carrying more than you can ends the negotiation
    if (encumbranceTier === "over_capacity") {
      breakdown.push({
        name: TIER_LABEL.over_capacity,
        value: `Speed set to ${OVER_CAPACITY_SPEED}`,
      });

      return { total: OVER_CAPACITY_SPEED, breakdown };
    }

    return { total: Math.max(0, total), breakdown };
  }
}
