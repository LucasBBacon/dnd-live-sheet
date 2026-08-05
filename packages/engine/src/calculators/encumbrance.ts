import {
  SIZE_CAPACITY_MULTIPLIER,
  oneSizeLarger,
  type CreatureSize,
} from "../rules/creatureSize.js";
import { hundredthsToPounds, poundsToHundredths } from "./weight.js";

export type EncumbranceTier =
  | "none"
  | "encumbered"
  | "heavily_encumbered"
  | "over_capacity";

/** Granted by trait_powerful_build; read here and nowhere else. */
export const POWERFUL_BUILD_STATE = "powerful_build";

export interface EncumbranceRules {
  /**
   * The PHB's optional variant. Off by default because the standard rule is
   * what a table plays unless it opts in: capacity is a hard ceiling and
   * nothing slows you down until you reach it.
   */
  useVariantEncumbrance: boolean;
}

export const DEFAULT_ENCUMBRANCE_RULES: EncumbranceRules = {
  useVariantEncumbrance: false,
};

export interface EncumbranceInput {
  /** From InventoryWeightCalculator.totalHundredths. */
  totalHundredths: number;
  /** The *final* score, after ASIs and any belt of giant strength. */
  strScore: number;
  size: CreatureSize;
  hasPowerfulBuild: boolean;
  rules?: EncumbranceRules;
}

export interface EncumbranceResult {
  /** Everything carried, in pounds, for display. */
  totalWeight: number;
  /** STR x 15 x size multiplier. The hard ceiling under both rulesets. */
  maxCapacity: number;
  /** STR x 5 x size multiplier. Zero when the variant rule is off. */
  encumberedThreshold: number;
  /** STR x 10 x size multiplier. Zero when the variant rule is off. */
  heavilyEncumberedThreshold: number;
  tier: EncumbranceTier;
  /**
   * The tier as a state string, so the speed calculator and later the roll
   * layer can gate on it the way they gate on any other condition. Empty at
   * "none". Deliberately not RuntimeModifiers: this result is derived from the
   * final STR score, and feeding modifiers back into the pool that produced
   * that score is a loop with no fixed point.
   */
  states: string[];
}

interface Thresholds {
  capacity: number;
  encumbered: number;
  heavilyEncumbered: number;
}

/**
 * Turns what a character is carrying into a carrying-capacity verdict.
 *
 * Takes size as an argument rather than sniffing it out of activeStates: size
 * is flat data on RaceDefinition and no state anywhere carries it, so reading
 * it from states would be reading something nothing writes.
 */
export class EncumbranceEngine {
  public static calculate({
    totalHundredths,
    strScore,
    size,
    hasPowerfulBuild,
    rules = DEFAULT_ENCUMBRANCE_RULES,
  }: EncumbranceInput): EncumbranceResult {
    // Powerful Build does not change the creature's size, only which row of
    // the capacity table it reads
    const effectiveSize = hasPowerfulBuild ? oneSizeLarger(size) : size;
    const multiplier = SIZE_CAPACITY_MULTIPLIER[effectiveSize];

    const thresholds: Thresholds = {
      capacity: strScore * 15 * multiplier,
      encumbered: strScore * 5 * multiplier,
      heavilyEncumbered: strScore * 10 * multiplier,
    };

    const tier = this.resolveTier(totalHundredths, thresholds, rules);

    return {
      totalWeight: hundredthsToPounds(totalHundredths),
      maxCapacity: thresholds.capacity,
      // reported as zero rather than as a number under the standard rule, so a
      // UI cannot draw a bar for a threshold that does nothing
      encumberedThreshold: rules.useVariantEncumbrance ? thresholds.encumbered : 0,
      heavilyEncumberedThreshold: rules.useVariantEncumbrance
        ? thresholds.heavilyEncumbered
        : 0,
      tier,
      states: tier === "none" ? [] : [tier],
    };
  }

  private static resolveTier(
    totalHundredths: number,
    thresholds: Thresholds,
    rules: EncumbranceRules,
  ): EncumbranceTier {
    // comparisons happen in hundredths so a fractional pound never rounds a
    // character across a boundary it has not actually crossed
    if (totalHundredths > poundsToHundredths(thresholds.capacity)) {
      return "over_capacity";
    }

    // the speed tiers are the variant rule's entire contribution, so a table
    // playing standard 5e never sees them
    if (!rules.useVariantEncumbrance) return "none";

    if (totalHundredths > poundsToHundredths(thresholds.heavilyEncumbered)) {
      return "heavily_encumbered";
    }

    if (totalHundredths > poundsToHundredths(thresholds.encumbered)) {
      return "encumbered";
    }

    return "none";
  }
}
