import type {
  ActionGrant,
  WeaponAttackContext,
  WeaponDefinition,
} from "@project/shared";
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
    attackContext: WeaponAttackContext = {
      hand: "main_hand",
      attackUsage: "standard",
      isTwoHandedGrip: false,
    },
    criticalDamageMaximized = false,
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
      attackContext.isTwoHandedGrip && weapon.versatileDamageDice
        ? weapon.versatileDamageDice
        : weapon.damageDice;

    const isOffHandAttack = attackContext.hand === "off_hand";
    const isTwoWeaponBonusAttack =
      attackContext.attackUsage === "two_weapon_bonus";
    const activation = isTwoWeaponBonusAttack ? "bonus_action" : "action";
    const idSuffix = isOffHandAttack ? "_off_hand" : "";
    const labelSuffix = isOffHandAttack ? " (Off-Hand)" : "";
    const gripSuffix =
      attackContext.isTwoHandedGrip && weapon.versatileDamageDice
        ? " (Two-Handed)"
        : "";

    return {
      id: `action_weapon_${weapon.id}${idSuffix}`,
      name: `${weapon.name}${labelSuffix}${gripSuffix}`,
      activation,

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
        weaponContext: attackContext,
        criticalDamageMaximized,
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
    attackContext: WeaponAttackContext = {
      hand: "main_hand",
      attackUsage: "standard",
      isTwoHandedGrip: false,
    },
    criticalDamageMaximized = false,
  ): ActionGrant[] {
    const actions: ActionGrant[] = [];

    // 1 - generate standard actions
    actions.push(
      this.generateWeaponAction(
        weapon,
        governingStat,
        attackContext,
        criticalDamageMaximized,
      ),
    );

    // 2 - generate alternate thrown action
    if (weapon.properties.includes("thrown")) {
      const thrownAction = this.generateWeaponAction(
        weapon,
        governingStat,
        attackContext,
        criticalDamageMaximized,
      );
      thrownAction.id = `${thrownAction.id}_thrown`;
      thrownAction.name = `${weapon.name} (Thrown)`;

      if (attackContext.hand === "off_hand") {
        thrownAction.name += " (Off-Hand)";
      }

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
