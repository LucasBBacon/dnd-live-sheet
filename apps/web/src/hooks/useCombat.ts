/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useAbilities, useDerivedStats } from "./useCharacterStats";
import { CombatEngine, WEAPON_DICTIONARY } from "@project/engine";

/**
 * A custom React hook that calculates the combat matrices for all equipped weapons in a character's inventory.
 * @returns An object containing an array of derived attack matrices for each equipped weapon, including attack bonuses, damage expressions, and the slot in which the weapon is equipped.
 */
export const useCombat = () => {
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);

  // compose the prerequisite math engines
  const { finalAbilities, totalMods } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(() => {
    // 1 - isolate items currently held in hands
    const equippedHands = inventory.filter(
      (item) => item.slot === "main_hand" || item.slot === "off_hand",
    );

    // 2 - map equipped items to their combat matrices
    const attacks = equippedHands.reduce((acc, item) => {
      const weaponDef = WEAPON_DICTIONARY[item.itemId];

      // if equipped item is not a weapon, skip it
      if (!weaponDef) return acc;

      // 3 - evaluate weapon prof
      // a character is proficient if they have the specific weapon id/broad category
      const isProficient =
        proficiencies[weaponDef.category] !== undefined ||
        proficiencies[weaponDef.id] !== undefined;

      // 4 - extract magic weapon bonuses
      // looks for active modifiers targeting this specific inventory instance id
      const magicMods = totalMods.filter(
        (m) => m.id.startsWith(item.id) && m.target === "ATTACK_BONUS",
      );
      const magicBonus = magicMods.reduce((sum, mod) => sum + mod.value, 0);

      // 5 - execute engine pipeline
      const derivedAttack = CombatEngine.calculateWeaponAttack(
        weaponDef,
        finalAbilities.str.score,
        finalAbilities.dex.score,
        profBonus,
        isProficient,
        magicBonus,
      );

      // 6 - ammo logic
      let currentAmmo = 0;
      let ammoInventoryId = null;

      if (weaponDef.ammoItemId) {
        // find operational row in backpack for ammo
        const ammoRow = inventory.find(
          (i) => i.itemId === weaponDef.ammoItemId,
        );
        if (ammoRow) {
          currentAmmo = ammoRow.quantity;
          ammoInventoryId = ammoRow.id;
        }
      }

      // attach physical slot to output so ui knows where it is equipped
      acc.push({
        ...derivedAttack,
        slot: item.slot,
        requiresAmmo: !!weaponDef.ammoItemId,
        currentAmmo,
        ammoInventoryId,
      });
      
      return acc;
    }, [] as any[]);

    return { attacks };
  }, [inventory, proficiencies, finalAbilities, profBonus, totalMods]);
};
