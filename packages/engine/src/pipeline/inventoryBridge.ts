import { EQUIPMENT_RULES_MAP } from "../rules/equipmentModifiers.js";
import type { Modifier } from "../types/engine.js";

export interface OperationalInventoryItem {
  id: string; // database instance UUID
  itemId: string; // reference ID (e.g., 'item_shield')
  slot: string; // current equipment slot
  isAttuned: boolean;
  requiresAttunement?: boolean; // from metadata
}

export class InventoryBridge {
  public static compileEquipmentModifiers(
    equippedItems: OperationalInventoryItem[],
  ): Modifier[] {
    const compiledModifiers: Modifier[] = [];

    for (const item of equippedItems) {
      // 1 - if it's in the backpack, cannot project mechanical modifiers
      if (item.slot === "backpack") continue;

      // 2 - check if a rule definition exists for this item type
      const ruleGenerator = EQUIPMENT_RULES_MAP[item.itemId];
      if (!ruleGenerator) continue;

      // 3 - evaluate and execute payload
      const itemModifiers = ruleGenerator(item.id);

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
