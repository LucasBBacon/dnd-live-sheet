import type { ItemDefinition } from "@project/shared";
import type { RuntimeModifier } from "@project/shared";
import { resolveItemDefinition, type RuleSnapshotLookup } from "../rules/ruleLookup.js";

export interface OperationalInventoryItem {
  id: string; // database instance UUID
  itemId: string; // reference ID (e.g., 'item_armor_shield')
  quantity: number;
  slot: string; // current equipment slot
  isAttuned: boolean;
  requiresAttunement?: boolean; // from metadata
}

/**
 * The InventoryBridge class serves as a utility for processing and compiling mechanical modifiers from a character's equipped items into a list of runtime modifiers. It provides methods to filter out items that are in the backpack, check for rule definitions, materialize runtime modifiers, and validate attunement constraints. This class is designed to facilitate the integration of item-based modifiers into a character's stats and abilities in a role-playing game context.
 */
export class InventoryBridge {

  /**
   * Compiles the mechanical modifiers from a character's equipped items into a list of runtime modifiers that can be applied to the character's stats and abilities. 
   * This method filters out items that are in the backpack, checks for rule definitions, materializes runtime modifiers, and validates attunement constraints.
   * @param equippedItems An array of OperationalInventoryItem objects representing the character's currently equipped items.
   * @param snapshot An optional snapshot object containing item definitions, used to resolve item metadata and modifiers.
   * @returns An array of RuntimeModifier objects representing the compiled modifiers from the equipped items.
   */
  public static compileEquipmentModifiers(
    equippedItems: OperationalInventoryItem[],
    snapshot?: RuleSnapshotLookup,
  ): RuntimeModifier[] {
    const compiledModifiers: RuntimeModifier[] = [];

    for (const item of equippedItems) {
      // 1 - if it's in the backpack, cannot project mechanical modifiers
      if (item.slot === "backpack") continue;

      // 2 - check if a rule definition exists for this item type
      const itemDefinition = resolveItemDefinition(item.itemId, snapshot);
      if (!itemDefinition?.modifiers?.length) continue;

      // 3 - materialize runtime modifiers for this item instance
      const itemModifiers: RuntimeModifier[] = itemDefinition.modifiers.map(
        (modifier, index) => ({
          id: `${item.id}_${item.itemId}_${index}`,
          sourceName: itemDefinition.name,
          sourceOrigin: `item:${item.itemId}`,
          isActive: true,
          ...modifier,
        }),
      );

      // 4 - validate attunement constraints
      const finalModifiers = itemModifiers.map((mod) => {
        if (item.requiresAttunement && !item.isAttuned) {
          return { ...mod, isActive: false }; // disable modifier if no attunement
        }
        return mod;
      });

      compiledModifiers.push(...finalModifiers);
    }

    return compiledModifiers;
  }
}
