import { ITEM_DICTIONARY } from "../rules/equipmentModifiers.js";
import type { RuntimeModifier } from "@project/shared";

export interface OperationalInventoryItem {
  id: string; // database instance UUID
  itemId: string; // reference ID (e.g., 'item_shield')
  quantity: number;
  slot: string; // current equipment slot
  isAttuned: boolean;
  requiresAttunement?: boolean; // from metadata
}

export class InventoryBridge {
  public static compileEquipmentModifiers(
    equippedItems: OperationalInventoryItem[],
  ): RuntimeModifier[] {
    const compiledModifiers: RuntimeModifier[] = [];

    for (const item of equippedItems) {
      // 1 - if it's in the backpack, cannot project mechanical modifiers
      if (item.slot === "backpack") continue;

      // 2 - check if a rule definition exists for this item type
      const itemDefinition = ITEM_DICTIONARY[item.itemId];
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
