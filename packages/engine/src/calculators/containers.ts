import type { InventoryInstance } from "@project/shared";
import {
  resolveItemDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { poundsToHundredths } from "./weight.js";

/** One container the character is carrying, and how full it is. */
export interface ContainerLoad {
  /** The inventory row id of the container itself. */
  instanceId: string;
  itemId: string;
  name: string;
  /** From the item's authored container.capacityPounds. */
  capacityHundredths: number;
  carriedHundredths: number;
  isOverloaded: boolean;
}

export interface ContainerReport {
  containers: ContainerLoad[];
  /**
   * Rows naming a containerId that resolves to nothing usable - a container
   * the character no longer carries, an item that is not a container, or the
   * row itself. Reported rather than dropped: the weight still counts against
   * the character, it is only the placement that is wrong.
   */
  unplacedInstanceIds: string[];
}

/**
 * Partitions a character's inventory across the containers they carry.
 *
 * Deliberately separate from InventoryWeightCalculator, which answers a
 * different question: that one totals everything regardless of where it sits,
 * because 5e counts a worn breastplate and a packed one identically. This one
 * only cares where things sit, and never changes the total.
 *
 * nothing here is enforced!! A container over capacity is reported so a UI can say so
 * no 5e rule stops a player overfilling a sack
 */
export class ContainerEngine {
  /**
   * Generates a report of the character's containers and their loads.
   * @param items The character's inventory items, including containers and their contents.
   * @param snapshot Optional snapshot of rule definitions to resolve item definitions.
   * @returns A ContainerReport detailing each container's load and any unplaced items.
   */
  public static report(
    items: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): ContainerReport {
    const loads = new Map<string, ContainerLoad>();

    // pass one: every row that is itself a container. done first so pass two
    // can tell an unknown parent from one that appears later in the list
    for (const instance of items) {
      const definition = resolveItemDefinition(instance.itemId, snapshot);
      if (!definition?.container) continue;

      loads.set(instance.id, {
        instanceId: instance.id,
        itemId: instance.itemId,
        name: definition.name,
        capacityHundredths: poundsToHundredths(
          definition.container.capacityPounds,
        ),
        carriedHundredths: 0,
        isOverloaded: false,
      });
    }

    // pass two: place everything that claims a parent
    const unplacedInstanceIds: string[] = [];

    for (const instance of items) {
      if (!instance.containerId) continue;

      // a row cannot be inside itself. bad data rather than a cycle worth
      // detecting, because containment is one level deep by decision
      const parent =
        instance.containerId === instance.id
          ? undefined
          : loads.get(instance.containerId);

      if (!parent) {
        unplacedInstanceIds.push(instance.id);
        continue;
      }

      const definition = resolveItemDefinition(instance.itemId, snapshot);
      // an item with no rule behind it contributes nothing rather than
      // throwing - InventoryExtractor already owns reporting unknown ids
      if (!definition) continue;

      // a nested container contributes its own weight, not its contents':
      // one level deep, so no cycle can form and no recursion is needed
      parent.carriedHundredths +=
        poundsToHundredths(definition.weight) * instance.quantity;
    }

    for (const load of loads.values()) {
      load.isOverloaded = load.carriedHundredths > load.capacityHundredths;
    }

    return { containers: Array.from(loads.values()), unplacedInstanceIds };
  }
}
