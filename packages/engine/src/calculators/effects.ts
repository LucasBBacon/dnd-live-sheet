import type { EngineEvent, RuntimeModifier } from "@project/shared";

export type DurationType =
  | "turn_start"
  | "turn_end"
  | "rounds"
  | "rest_short"
  | "rest_long"
  | "manual";

export interface ActiveEffect {
  instanceId: string; // unique UUId for this specific application of the effect
  sourceName: string; // e.g., "Shield Spell"
  durationType: DurationType;
  durationRemaining?: number | undefined; // used on for 'rounds'
  isSelfConcentration: boolean; // if true, drops on failed CON save
  modifiers: RuntimeModifier[]; // e.g., [{target: "ARMOR_CLASS", type: "add", value: 5}]
  grantedStates: string[]; // e.g., ["shield_spell_active", "immune_to_magic_missile"]
}

// region EFFECT MANAGER

/**
 * EffectManager is the central state store for a live character sheet.
 * It handles the lifecycle of temporary buffs/debuffs and compiles them
 * for the calculator engines.
 */
export class EffectManager {
  private effects: Map<string, ActiveEffect> = new Map();

  /**
   * Ingests a new effect. If it requires concentration, it automatically
   * clears any existing self-concentration effect per 5e rules.
   * @param effect Effect to be ingested.
   */
  public addEffect(effect: ActiveEffect): void {
    // 5e rule - same spells don't stack, override duration
    if (effect.isSelfConcentration) {
      this.dropConcentration();
    }
    this.effects.set(effect.instanceId, effect);
  }

  public removeEffect(instanceId: string): void {
    this.effects.delete(instanceId);
  }

  /**
   * Drops whatever the character is currently concentrating on.
   */
  public dropConcentration(): void {
    for (const [id, effect] of this.effects.entries()) {
      if (effect.isSelfConcentration) {
        this.effects.delete(id);
      }
    }
  }

  // region LIFECYCLE TRIGGERS

  /**
   * Triggered when the player clicks "Start Turn" in their UI.
   */
  public tickTurnStart(): void {
    for (const [id, effect] of this.effects.entries()) {
      if (effect.durationType === "turn_start") {
        this.effects.delete(id);
      } else if (
        effect.durationType === "rounds" &&
        effect.durationRemaining !== undefined
      ) {
        effect.durationRemaining -= 1;
        if (effect.durationRemaining <= 0) {
          this.effects.delete(id);
        }
      }
    }
  }

  /**
   * Triggered when the player clicks "End Turn" in their UI.
   */
  public tickTurnEnd(): void {
    for (const [id, effect] of this.effects.entries()) {
      if (effect.durationType === "turn_end") {
        this.effects.delete(id);
      }
    }
  }

  public tickRest(isLongRest: boolean): void {
    for (const [id, effect] of this.effects.entries()) {
      if (effect.durationType === "rest_short") {
        this.effects.delete(id);
      } else if (isLongRest && effect.durationType) {
        this.effects.delete(id);
      }
    }
  }

  // endregion

  // region DATA COMPILATION

  /**
   * Flattens all active effects into a single array of RuntimeModifiers.
   * @returns Array of current RuntimeModifiers.
   */
  public getActiveModifiers(): RuntimeModifier[] {
    const allModifiers: RuntimeModifier[] = [];
    for (const effect of this.effects.values()) {
      const stampedMods = effect.modifiers.map((mod) => ({
        ...mod,
        instanceId: effect.instanceId,
      }));
      allModifiers.push(...stampedMods);
    }
    return allModifiers;
  }

  /**
   * Flattens all active effects into an array of string states.
   * @returns An array of current string states.
   */
  public getActiveStates(): string[] {
    const allStates = new Set<string>();
    for (const effect of this.effects.values()) {
      effect.grantedStates.forEach((state) => allStates.add(state));
    }
    return Array.from(allStates);
  }

  // endregion
}

// endregion
