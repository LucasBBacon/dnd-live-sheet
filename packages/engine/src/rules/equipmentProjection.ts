import type {
  EquipmentDefinition,
  ItemDefinition,
  WeaponDefinition,
} from "@project/shared";

/**
 * The two views the engine takes of a piece of equipment.
 *
 * Equipment is the canonical shape a pack authors. An item is what the
 * inventory and encumbrance code reads; a weapon is what the attack code
 * reads, and only exists when the equipment carries a weapon block.
 *
 * These lived in equipmentDictionary.ts. They are projections rather than
 * content, so they outlived it - the dictionary they sat beside is gone, but
 * every consumer still needs to take these two views of whatever the pack
 * supplies.
 */
export const toItemDefinition = (
  equipment: EquipmentDefinition,
): ItemDefinition => {
  const base: ItemDefinition = {
    id: equipment.id,
    name: equipment.name,
    type: equipment.type,
    weight: equipment.weight,
    requiresAttunement: equipment.requiresAttunement,
    categoryTags: equipment.categoryTags,
    // these stay absent rather than undefined so the projection keeps matching
    // the exact-shape assertions the equipment tests make
    ...(equipment.armorCategory && { armorCategory: equipment.armorCategory }),
    ...(equipment.equipSlot && { equipSlot: equipment.equipSlot }),
    ...(equipment.ammoTag && { ammoTag: equipment.ammoTag }),
    ...(equipment.container && { container: equipment.container }),
    ...(equipment.modifiers && { modifiers: equipment.modifiers }),
  };

  return base;
};

export const toWeaponDefinition = (
  equipment: EquipmentDefinition,
): WeaponDefinition | undefined => {
  if (!equipment.weapon) {
    return undefined;
  }

  return {
    id: equipment.id,
    name: equipment.name,
    ...equipment.weapon,
  };
};
