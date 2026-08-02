/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useAbilities, useDerivedStats } from "./useCharacterStats";
import {
  CombatEngine,
  resolveWeaponDefinition,
  type Ability,
} from "@project/engine";
import type { FixedProficiencyGrant } from "@project/shared";

/**
 * A custom React hook that calculates the combat matrices for all equipped weapons in a character's inventory.
 * @returns An object containing an array of derived attack matrices for each equipped weapon, including attack bonuses, damage expressions, and the slot in which the weapon is equipped.
 */
export const useCombat = () => {
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  // compose the prerequisite math engines
  const { finalAbilities, totalMods } = useAbilities();
  const { profBonus } = useDerivedStats();

  return useMemo(() => {
    // 1 - isolate items currently held in hands
    const equippedHands = inventory.filter(
      (item) => item.slot === "main_hand" || item.slot === "off_hand",
    );

    // flatten derived abilities back to raw scores for the engine
    const abilityScores = Object.fromEntries(
      (Object.keys(finalAbilities) as Ability[]).map((stat) => [
        stat,
        finalAbilities[stat].score,
      ]),
    ) as Record<Ability, number>;

    const inventoryIds = inventory.map((i) => i.id);

    // 2 - map equipped items to their combat matrices
    const attacks = equippedHands.reduce((acc, item) => {
      const weaponDef = resolveWeaponDefinition(item.itemId, ruleSnapshot ?? undefined);

      // if equipped item is not a weapon, skip it
      if (!weaponDef) return acc;

      // 3 - translate the store's flat proficiency record into the grant shape
      // the engine expects. Only the two ids it tests for are relevant here;
      // the record carries no category, so nothing else can be classified.
      const weaponProficiencies: FixedProficiencyGrant[] = [
        weaponDef.category,
        weaponDef.id,
      ]
        .filter((id) => {
          const level = proficiencies[id];
          return level !== undefined && level !== "none";
        })
        .map((id) => ({
          category: "weapons" as const,
          proficiencyId: id,
          level: proficiencies[id] as "proficient" | "expertise",
          requiredStates: [],
        }));

      // 4 - scope modifiers to this weapon
      // instance-scoped mods (magic weapons) only apply to their own item;
      // anything not bound to an inventory row is global and applies to all.
      const applicableMods = totalMods.filter((m) => {
        const owner = inventoryIds.find((id) => m.id.startsWith(id));
        return owner === undefined || owner === item.id;
      });

      // 5 - execute engine pipeline
      const derivedAttack = CombatEngine.calculateWeaponAttack(
        weaponDef,
        abilityScores,
        profBonus,
        weaponProficiencies,
        applicableMods,
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
  }, [inventory, proficiencies, finalAbilities, profBonus, totalMods, ruleSnapshot]);
};
