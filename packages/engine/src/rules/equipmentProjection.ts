import type { EquipmentDefinition, WeaponCapability } from "@project/shared";

/**
 * The attack view of a piece of equipment: its weapon capability, flattened
 * with the identity fields (id, name) that live on the equipment entry
 * itself rather than inside the nested weapon block.
 *
 * Equipment is the canonical, single authored item shape - the inventory and
 * encumbrance code reads it directly, with no projection needed, because
 * every field they want (weight, equipSlot, container, ...) already lives at
 * the top level. Attack code is the one consumer that still wants a flat
 * shape, since combat.ts, weaponSynthesizer.ts and rollContextBuilder.ts all
 * read id/name alongside category, damageDice and the rest without wanting
 * to reach through `.weapon` for half of them. This view exists for that
 * reason alone; it is a runtime read model; it is not authored content and
 * carries no schema of its own.
 *
 * This lived in equipmentDictionary.ts as toWeaponDefinition, alongside an
 * equivalent toItemDefinition. The dictionary they sat beside is gone, and so
 * is the item half of the projection - EquipmentDefinition itself is what
 * item-facing code reads now.
 */
export type WeaponView = Pick<
  EquipmentDefinition,
  "id" | "name" | "categoryTags"
> &
  WeaponCapability;

export const toWeaponDefinition = (
  equipment: EquipmentDefinition,
): WeaponView | undefined => {
  if (!equipment.weapon) {
    return undefined;
  }

  return {
    id: equipment.id,
    name: equipment.name,
    // carried so itemProficiency.ts can decide whether a grant covers this
    // weapon without reaching back to the equipment entry
    categoryTags: equipment.categoryTags,
    ...equipment.weapon,
  };
};
