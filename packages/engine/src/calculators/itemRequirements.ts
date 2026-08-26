import type { InventoryInstance, ItemRequirement } from "@project/shared";
import type { Ability } from "../types/core.js";
import { isEquipped } from "../rules/equipSlots.js";
import {
  resolveEquipmentDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";

/** Set while any worn item's ability requirement goes unmet. */
export const REQUIREMENT_UNMET_STATE = "status_item_requirement_unmet";

/**
 * Packs author minimums lowercase (`str`), because that is how every other
 * prerequisite block spells them; the calculators key abilities uppercase.
 * The two vocabularies meet here and nowhere else.
 */
const ABILITY_OF_KEY: Record<string, Ability> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export interface UnmetItemRequirement {
  instanceId: string;
  itemId: string;
  sourceName: string;
  ability: Ability;
  requiredScore: number;
  actualScore: number;
  /** The penalty this shortfall costs, as the pack declared it. */
  penaltyFeet: number;
}

export interface ItemRequirementInput {
  items: InventoryInstance[];
  /** The *final* scores, after ASIs and any belt of giant strength. */
  abilityScores: Record<Ability, number>;
  snapshot?: RuleSnapshotLookup | undefined;
}

export interface ItemRequirementCharge {
  instanceId: string;
  /** Ready to show in a speed breakdown. */
  label: string;
  feet: number;
}

export interface ItemRequirementResult {
  unmet: UnmetItemRequirement[];
  /**
   * One entry per requirement actually charged. A single suit can fall short
   * on several abilities at once, but the penalty is the item's, not the
   * ability's, so it is paid once.
   */
  charges: ItemRequirementCharge[];
  /** Every charge, summed. */
  speedPenaltyFeet: number;
  /**
   * The verdict as a state string, so the roll layer can gate on it the way it
   * gates on any other condition. Deliberately not RuntimeModifiers: this is
   * derived from the final ability scores, and feeding modifiers back into the
   * pool that produced them is a loop with no fixed point.
   */
  states: string[];
}

/**
 * Decides which worn items their wearer is not strong enough for, and what
 * that costs.
 *
 * 5e never forbids wearing armour you fall short of - it slows you down - so
 * this reports a penalty rather than refusing the equip.
 */
export class ItemRequirementEngine {
  public static evaluate({
    items,
    abilityScores,
    snapshot,
  }: ItemRequirementInput): ItemRequirementResult {
    const unmet: UnmetItemRequirement[] = [];
    const charges: ItemRequirementCharge[] = [];

    for (const instance of items) {
      // a requirement is a cost of *wearing* the thing, so an item in the pack
      // asks nothing of whoever is carrying it
      if (!isEquipped(instance.slot)) continue;

      const definition = resolveEquipmentDefinition(instance.itemId, snapshot);
      // an id with no rule behind it is skipped rather than thrown on: a save
      // outlives the homebrew pack that authored it
      if (!definition?.requirements) continue;

      const sourceName = instance.customName || definition.name;

      for (const requirement of definition.requirements) {
        const shortfalls = this.shortfalls(requirement, abilityScores);
        if (shortfalls.length === 0) continue;

        unmet.push(
          ...shortfalls.map((shortfall) => ({
            instanceId: instance.id,
            itemId: instance.itemId,
            sourceName,
            ...shortfall,
            penaltyFeet: requirement.unmetPenalty.feet,
          })),
        );

        const [first] = shortfalls;

        charges.push({
          instanceId: instance.id,
          label: `${sourceName} (requires ${first!.ability} ${first!.requiredScore})`,
          feet: requirement.unmetPenalty.feet,
        });
      }
    }

    const speedPenaltyFeet = charges.reduce(
      (total, charge) => total + charge.feet,
      0,
    );

    return {
      unmet,
      charges,
      speedPenaltyFeet,
      states: unmet.length > 0 ? [REQUIREMENT_UNMET_STATE] : [],
    };
  }

  private static shortfalls(
    requirement: ItemRequirement,
    abilityScores: Record<Ability, number>,
  ): Array<{ ability: Ability; requiredScore: number; actualScore: number }> {
    const results: Array<{
      ability: Ability;
      requiredScore: number;
      actualScore: number;
    }> = [];

    for (const [key, requiredScore] of Object.entries(
      requirement.abilityMinimums,
    )) {
      const ability = ABILITY_OF_KEY[key];
      if (ability === undefined || requiredScore === undefined) continue;

      const actualScore = abilityScores[ability];
      if (actualScore >= requiredScore) continue;

      results.push({ ability, requiredScore, actualScore });
    }

    return results;
  }
}
