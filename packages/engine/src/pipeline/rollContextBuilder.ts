import type { ActionGrant, WeaponDefinition } from "@project/shared";

export interface StateToggle {
  id: string; // activeState string (e.g., "two_handed_grip")
  label: string; // "Two-Handed Grip"
  defaultState: boolean;
  group?: string; // used for mutually exclusive radio buttons (e.g., "advantage_State")
}

export interface RollContextPayload {
  actionId: string;
  activeStates: string[];
  consumedSlotId?: string; // populated if upcast
}

export class RollContextBuilder {
  public static buildWeaponToggles(
    action: ActionGrant,
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
