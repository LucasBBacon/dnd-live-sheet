import type { DynamicWeaponAttack } from "@project/shared";
import type { WeaponView } from "../rules/equipmentProjection.js";

/**
 * Whether a `dynamic_weapon_attack` template offers a swing with this weapon,
 * right now.
 *
 * Frenzied Strike and Retaliation are "a melee weapon attack", which names no
 * weapon: the swing exists once per held weapon that qualifies. The server
 * synthesises those swings in CharacterEngine's weapon loop and the sheet
 * draws their cards in useCombat. Both ask this one function, so the sheet
 * never offers a swing the server will not resolve.
 *
 * Every rule that offers one says "melee weapon attack", so a ranged weapon is
 * never eligible, whatever the category filter says.
 * @param effect The template the trait authored.
 * @param weapon The held weapon being considered.
 * @param activeStates The character's active states.
 * @returns True when the predicate holds and the weapon passes every filter.
 */
export const dynamicAttackApplies = (
  effect: DynamicWeaponAttack,
  weapon: WeaponView,
  activeStates: string[],
): boolean => {
  if (!effect.requiredStates.every((state) => activeStates.includes(state))) {
    return false;
  }
  if (effect.forbiddenStates.some((state) => activeStates.includes(state))) {
    return false;
  }
  if (weapon.category.includes("ranged")) return false;
  if (
    !effect.requiredWeaponProperties.every((property) =>
      weapon.properties.some((weaponProperty) => weaponProperty === property),
    )
  ) {
    return false;
  }

  return (
    effect.requiredWeaponCategory.length === 0 ||
    effect.requiredWeaponCategory.includes(weapon.category)
  );
};

/**
 * The id of the swing a template offers with the weapon in one hand.
 *
 * The server finds the action it resolves by this id in `liveSheet.actions`,
 * and the sheet sends it in ACTION_INTENT, so it is spelled in one place.
 * Keyed on the hand, not the inventory row: equipping one item from a stack
 * splits it into a row the sheet mints and the server never sees, but both
 * sides always agree on what is in each hand.
 * @param templateId The trait action carrying the template.
 * @param hand The hand holding the weapon.
 * @returns `${templateId}:${hand}`.
 */
export const dynamicAttackId = (
  templateId: string,
  hand: "main_hand" | "off_hand",
): string => `${templateId}:${hand}`;
