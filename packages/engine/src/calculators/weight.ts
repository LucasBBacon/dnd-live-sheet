import type { InventoryInstance } from "@project/shared";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";

/**
 * Weight is authored in pounds because that is what a person reads in a
 * rulebook, and summed in hundredths of a pound because floats do not add up:
 * twenty arrows at 0.05 lb each make 1.0000000000000002.
 *
 * The items table stores hundredths in an integer column for the same reason,
 * so this is the same unit the database already thinks in.
 */
export const poundsToHundredths = (pounds: number): number =>
  Math.round(pounds * 100);

export const hundredthsToPounds = (hundredths: number): number =>
  hundredths / 100;

/**
 * Totals what a character is carrying.
 *
 * Pure by the same argument as InventoryExtractor: it takes the inventory as
 * an argument rather than reaching into a store, so the engine stays
 * independent of the app hosting it.
 */
export class InventoryWeightCalculator {
  /**
   * Everything the character is carrying, in hundredths of a pound.
   *
   * Slot is deliberately not consulted: worn armour and a wielded sword weigh
   * exactly what they would in the pack, and 5e counts both.
   *
   * An item with no rule behind it contributes nothing rather than throwing -
   * a save outlives the homebrew pack that authored it. InventoryExtractor
   * already owns reporting those ids, so they are not re-reported here.
   */
  public static totalHundredths(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): number {
    let total = 0;

    for (const instance of items) {
      const definition = resolveItemDefinition(instance.itemId, snapshot);
      if (!definition) continue;

      total += poundsToHundredths(definition.weight) * instance.quantity;
    }

    return total;
  }

  /** The same total in pounds, for display and for the sheet snapshot. */
  public static totalPounds(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): number {
    return hundredthsToPounds(this.totalHundredths(items, snapshot));
  }
}
