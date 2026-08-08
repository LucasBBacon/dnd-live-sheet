import type { ActionGrant, WeaponDefinition } from "@project/shared";
import type { Ability } from "../types/core.js";

/**
 * WeaponSynthesizer bridges the Inventory system and the Action pipeline
 * by converting static weapon definitions into executable ActionGrants
 */
export class WeaponSynthesizer {
  /**
   * Generates a standard ActionGrant for an equipped weapon.
   * @param weapon The static weapon definition
   * @param governingStat The optimal stat (e.g., DEX for finesse) pre-calculated by CombatEngine
   * @param isTwoHandedGrip UI toggle state for versatile weapons
   * @returns Granted action based on static weapon definition
   */
  public static generateWeaponAction(
    weapon: WeaponDefinition,
    governingStat: Ability,
    isTwoHandedGrip: boolean = false,
  ): ActionGrant {
    const isRanged =
      weapon.category === "martial_ranged" ||
      weapon.category === "simple_ranged";
    const hasReach = weapon.properties.includes("reach");

    const baseRange = isRanged
      ? weapon.range
      : hasReach
        ? Math.max(weapon.range, 10)
        : 5;
    const maxRange = isRanged ? weapon.longRange : undefined;

    const damageDice =
      isTwoHandedGrip && weapon.versatileDamageDice
        ? weapon.versatileDamageDice
        : weapon.damageDice;

    return {
      id: `action_weapon_${weapon.id}`,
      // append grip status for UI clarity
      name:
        weapon.name +
        (isTwoHandedGrip && weapon.versatileDamageDice ? " (Two-Handed)" : ""),
      activation: "action",

      // ammunition is drawn from the inventory, not from a charge pool, so it
      // travels on its own field. Routing it through consumesResource made
      // every shot fail: the ResourceManager has no such pool to spend
      consumesAmmo: weapon.properties.includes("ammunition")
        ? (weapon.ammoTag ?? weapon.ammoItemId)
        : undefined,

      effect: {
        type: "attack",
        // categorize accurately for engine's critical hit/trait filters
        attackType: isRanged ? "ranged_weapon" : "melee_weapon",
        attackStat: governingStat,
        range: baseRange,
        longRange: maxRange,
        damage: [
          {
            sourceName: weapon.name,
            baseDice: damageDice,
            damageType: weapon.damageType,
            scalingMode: "none",
            levelScaling: [],
          },
        ],
      },
    };
  }

  /**
   * Thrown weapons (like handaxes and daggers) require two separate ActionGrants
   * since they can be used in melee OR at range.
   * @param weapon The static weapon definition
   * @param governingStat The optimal stat (e.g., DEX for finesse) pre-calculated by CombatEngine
   * @returns Granted actions based on static thrown weapon definition
   */
  public static generateThrownWeaponActions(
    weapon: WeaponDefinition,
    governingStat: Ability,
  ): ActionGrant[] {
    const actions: ActionGrant[] = [];

    // 1 - generate standard actions
    actions.push(this.generateWeaponAction(weapon, governingStat, false));

    // 2 - generate alternate thrown action
    if (weapon.properties.includes("thrown")) {
      const thrownAction = this.generateWeaponAction(
        weapon,
        governingStat,
        false,
      );
      thrownAction.id = `action_weapon_${weapon.id}_thrown`;
      thrownAction.name = `${weapon.name} (Thrown)`;

      if (thrownAction.effect.type === "attack") {
        thrownAction.effect.attackType = "ranged_weapon"; // shift taxonomy for traits
        thrownAction.effect.range = weapon.range;
        thrownAction.effect.longRange = weapon.longRange;
      }

      actions.push(thrownAction);
    }

    return actions;
  }
}
