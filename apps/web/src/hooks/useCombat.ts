/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useAbilities, useDerivedStats } from "./useCharacterStats";
import {
  CombatEngine,
  dynamicAttackApplies,
  dynamicAttackId,
  resolveWeaponDefinition,
  type Ability,
} from "@project/engine";
import type { FixedProficiencyGrant, TraitDefinition } from "@project/shared";

/**
 * A custom React hook that calculates the combat matrices for all equipped weapons in a character's inventory.
 * @returns An object containing an array of derived attack matrices for each equipped weapon, including attack bonuses, damage expressions, and the slot in which the weapon is equipped.
 */
export const useCombat = () => {
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
  const traitGrants = useCharacterSheetStore((state) => state.traitGrants);
  const availableTraits = useCharacterSheetStore((state) => state.traits);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  const subclassIds = useCharacterSheetStore((state) => state.subclassIds);

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

    const activeTraits = Array.from(
      new Map<string, TraitDefinition>([
        ...(availableTraits ?? []).map((trait) => [trait.id, trait] as const),
        ...traitGrants.flatMap((grant) => {
          const trait = ruleSnapshot?.traitsById?.[grant.traitId];
          return trait ? [[trait.id, trait] as const] : [];
        }),
      ]).values(),
    );
    const criticalHitModifiers = activeTraits.flatMap(
      (trait) => trait.criticalHitModifiers ?? [],
    );

    // read through the store's compile, the same traits the server
    // synthesises its swings from, so a subclass feature like Frenzy is
    // never missed here
    const dynamicTemplates = getActiveTraits()
      .flatMap((trait) => trait.actions ?? [])
      .filter((action) => action.effect.type === "dynamic_weapon_attack");

    // 2 - map equipped items to their combat matrices
    const attacks = equippedHands.reduce((acc, item) => {
      const weaponDef = resolveWeaponDefinition(
        item.itemId,
        ruleSnapshot ?? undefined,
      );

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

      const weaponAttackContext = {
        hand:
          item.slot === "off_hand"
            ? ("off_hand" as const)
            : ("main_hand" as const),
        attackUsage:
          item.slot === "off_hand"
            ? ("two_weapon_bonus" as const)
            : ("standard" as const),
        isTwoHandedGrip: activeStates.includes("two_handed_grip"),
      };

      // 5 - execute engine pipeline
      const derivedAttack = CombatEngine.calculateWeaponAttack(
        weaponDef,
        abilityScores,
        profBonus,
        weaponProficiencies,
        applicableMods,
        activeStates,
        criticalHitModifiers,
        false,
        undefined,
        weaponAttackContext,
        // without this a class_level_thresholds modifier resolves to zero, so
        // Rage's damage bonus silently vanishes from the attack panel
        classLevels,
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
        activation: item.slot === "off_hand" ? "bonus_action" : "action",
        actionId:
          item.slot === "off_hand"
            ? `action_weapon_${weaponDef.id}_off_hand`
            : `action_weapon_${weaponDef.id}`,
        requiresAmmo: !!weaponDef.ammoItemId,
        currentAmmo,
        ammoInventoryId,
      });

      // one further card per template that offers a swing with this weapon:
      // the weapon card's own numbers, the template's activation, and the id
      // the server gives the swing it synthesises, so pressing the card
      // resolves it. Only melee weapons qualify, so there is no ammunition.
      for (const template of dynamicTemplates) {
        if (template.effect.type !== "dynamic_weapon_attack") continue;
        if (!dynamicAttackApplies(template.effect, weaponDef, activeStates)) {
          continue;
        }

        acc.push({
          ...derivedAttack,
          name: `${template.name}: ${weaponDef.name}`,
          slot: item.slot,
          activation: template.activation,
          actionId: dynamicAttackId(template.id, item.id),
          requiresAmmo: false,
          currentAmmo: 0,
          ammoInventoryId: null,
        });
      }

      return acc;
    }, [] as any[]);

    return { attacks };
  }, [
    inventory,
    proficiencies,
    traitGrants,
    availableTraits,
    activeStates,
    classLevels,
    finalAbilities,
    profBonus,
    totalMods,
    ruleSnapshot,
    getActiveTraits,
    subclassIds,
  ]);
};
