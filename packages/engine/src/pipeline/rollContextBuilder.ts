import type {
  ActionGrant,
  InventoryInstance,
  WeaponDefinition,
} from "@project/shared";
import { resolveItemDefinition, type RuleSnapshotLookup } from "../rules/ruleLookup.js";

export interface StateToggle {
  id: string; // activeState string (e.g., "two_handed_grip")
  label: string; // "Two-Handed Grip"
  defaultState: boolean;
  group?: string; // used for mutually exclusive radio buttons (e.g., "advantage_State")
}

/**
 * Where a cost is paid from.
 *
 * "trait_pool" spends charges the ResourceManager tracks, like ki points.
 * "inventory_instance" spends a physical stack the player picked, which is how
 * a specific quiver gets chosen when several kinds of arrow are carried.
 */
export type ConsumedResourceType = "trait_pool" | "inventory_instance";

export interface ConsumedResource {
  type: ConsumedResourceType;
  /** A resource pool id, or the inventory row id for an inventory_instance. */
  id: string;
  amount: number;
}

/** One selectable stack of ammunition, for the roll preparation UI. */
export interface AmmoOption {
  /** The inventory row id, echoed back as ConsumedResource.id. */
  instanceId: string;
  itemId: string;
  label: string;
  quantity: number;
}

export interface RollContextPayload {
  actionId: string;
  activeStates: string[];
  consumedSlotId?: string; // populated if upcast
  /**
   * Everything this roll spends. An array because a single attack can cost
   * both a pool and a stack — a ki-fuelled arrow spends ki *and* an arrow —
   * and because the resolver commits them together or not at all.
   */
  consumedResources?: ConsumedResource[];
}

export class RollContextBuilder {
  public static buildWeaponToggles(
    weapon: WeaponDefinition,
    hasSneakAttackTrait: boolean,
  ): StateToggle[] {
    const toggles: StateToggle[] = [];

    // 1 - base roll states (universally applicable to attacks)
    toggles.push(
      {
        id: "has_advantage",
        label: "Advantage",
        defaultState: false,
        group: "roll_state",
      },
      {
        id: "has_disadvantage",
        label: "Disadvantage",
        defaultState: false,
        group: "roll_state",
      },
    );

    // 2 - weapon-specific states
    if (weapon.properties.includes("versatile")) {
      toggles.push({
        id: "two_handed_grip",
        label: "Two-Handed Grip (Versatile)",
        defaultState: false,
      });
    }

    if (weapon.properties.includes("light")) {
      toggles.push({
        id: "offhand_attack",
        label: "Offhand Attack",
        defaultState: false,
      });
    }

    // 3 - trait specific states
    const isFinesseOrRanged =
      weapon.properties.includes("finesse") ||
      weapon.properties.includes("range");
    if (hasSneakAttackTrait && isFinesseOrRanged) {
      toggles.push({
        id: "apply_sneak_attack",
        label: "Apply Sneak Attack",
        defaultState: false,
      });
    }

    return toggles;
  }

  /**
   * Every stack the character carries that the weapon can fire.
   *
   * Matching is by ammo tag rather than item id, so a quiver of +1 Arrows is
   * offered alongside ordinary ones instead of being invisible to the bow.
   * The caller renders these as the choice the player makes before rolling;
   * whichever they pick comes back as a ConsumedResource on the payload.
   *
   * Ordered by the inventory's own order so the list is stable between rolls.
   */
  public static buildAmmoOptions(
    weapon: Pick<WeaponDefinition, "ammoItemId" | "ammoTag">,
    inventory: InventoryInstance[],
    snapshot?: RuleSnapshotLookup,
  ): AmmoOption[] {
    // a weapon that names neither a tag nor a default item needs no ammunition
    if (!weapon.ammoTag && !weapon.ammoItemId) return [];

    const options: AmmoOption[] = [];

    for (const row of inventory) {
      if (row.quantity <= 0) continue;

      const definition = resolveItemDefinition(row.itemId, snapshot);
      if (!definition) continue;

      const matchesTag =
        weapon.ammoTag !== undefined && definition.ammoTag === weapon.ammoTag;
      // an untagged item still works if the weapon names it outright, which
      // keeps older content loadable
      const matchesDefault = row.itemId === weapon.ammoItemId;

      if (!matchesTag && !matchesDefault) continue;

      options.push({
        instanceId: row.id,
        itemId: row.itemId,
        label: row.customName ?? definition.name,
        quantity: row.quantity,
      });
    }

    return options;
  }

  public static buildTargetWarnings(action: ActionGrant): string[] {
    const warnings: string[] = [];

    const filter = action.targetFilter;

    if (!filter) return warnings;

    if (filter.requiresVisibility) {
      warnings.push("You must be able to clearly see the target.");
    }

    if (filter.allowedTypes && filter.allowedTypes.length > 0) {
      // e.g., "Target MUST be: Humanoid"
      warnings.push(`Target MUST be: ${filter.allowedTypes.join(" or ")}`);
    }

    if (filter.forbiddenTypes && filter.forbiddenTypes.length > 0) {
      // e.g., "Target CANNOT be: Construct, Undead"
      warnings.push(`Target CANNOT be: ${filter.forbiddenTypes.join(", ")}`);
    }

    return warnings;
  }
}
