import type { EquipmentDefinition, FixedProficiencyGrant } from "@project/shared";
import type { WeaponView } from "./equipmentProjection.js";

/**
 * Which proficiency ids cover this item.
 *
 * An item names its own proficiencies. There is no second vocabulary to keep
 * in sync with the catalogue, because the vocabulary *is* the catalogue: a
 * grant is legal exactly when some item answers to it, which is what
 * proficiencyRosterDrift.test.ts asserts over the shipped pack.
 *
 * This is the reason the whole category was dead before. The calculator used
 * to match a grant against `weapon.category` ("martial_melee") or the item id,
 * while the pack authored "martial_weapons" and ten `weapon_*` ids. Zero of
 * the twelve matched anything, and nothing anywhere said so.
 */
export const weaponProficiencyIds = (weapon: WeaponView): string[] => [
  weapon.id,
  ...weapon.categoryTags,
];

/**
 * The armour equivalent.
 *
 * Armour carries its category in `armorCategory` rather than in a tag, except
 * the shield, which has no category and is tagged instead. Both shapes are
 * flattened to one `category_armor_*` family so a grant reads the same either
 * way, which is what closes the `light_armor` / `armor_light` split the pack
 * shipped with.
 *
 * Nothing in the runtime reads armour proficiency - no calculator applies the
 * 5e penalty for wearing armour you are not proficient with. The reader this
 * function exists for is the drift guard, and that is a real reader: it is
 * what stops the split reopening. Do not delete this as dead code.
 */
export const armorProficiencyIds = (item: EquipmentDefinition): string[] => [
  ...new Set([
    item.id,
    ...(item.armorCategory ? [`category_armor_${item.armorCategory}`] : []),
    ...item.categoryTags.filter((tag) => tag.startsWith("category_armor_")),
  ]),
];

/**
 * Whether any of these grants covers this weapon.
 * @param grants Every proficiency the character holds, in every category.
 * @param weapon The weapon being swung.
 * @returns True when a `weapons` grant names an id this weapon answers to.
 */
export const isProficientWithWeapon = (
  grants: FixedProficiencyGrant[],
  weapon: WeaponView,
): boolean => {
  const ids = weaponProficiencyIds(weapon);

  return grants.some(
    (grant) => grant.category === "weapons" && ids.includes(grant.proficiencyId),
  );
};
