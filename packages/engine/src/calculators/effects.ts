import type { ActorInstance, RuntimeModifier } from "@project/shared";

export type DurationType =
  | "turn_start"
  | "turn_end"
  | "rounds"
  | "rest_short"
  | "rest_long"
  | "manual";

export interface SummonEntity {
  templateId: string;
  label: string;
}

export interface ActiveEffect {
  instanceId: string; // unique UUId for this specific application of the effect
  sourceName: string; // e.g., "Shield Spell"
  effectTag?: string;
  durationType: DurationType;
  durationRemaining?: number | undefined; // used on for 'rounds'
  isSelfConcentration: boolean; // if true, drops on failed CON save
  modifiers: RuntimeModifier[]; // e.g., [{target: "ARMOR_CLASS", type: "add", value: 5}]
  grantedStates: string[]; // e.g., ["shield_spell_active", "immune_to_magic_missile"]
  kind?: "summon" | "effect";
  durationHours?: number;
  summonEntities?: SummonEntity[];
}

// region EFFECT MANAGER

/**
 * EffectManager is the central state store for a live character sheet.
 * It handles the lifecycle of temporary buffs/debuffs and compiles them
 * for the calculator engines.
 */
export class EffectManager {
  private effects: Map<string, ActiveEffect> = new Map();
  private actors: Map<string, ActorInstance> = new Map();

  /**
   * Ingests a new effect.
   * If it requires concentration, it automatically clears any existing self-concentration effect per 5e rules.
   * @param effect Effect to be ingested.
   */
  public addEffect(effect: ActiveEffect): void {
    // 5e rule - same spells don't stack, override duration
    if (effect.isSelfConcentration) {
      this.dropConcentration();
    }
    this.effects.set(effect.instanceId, effect);
  }

  /**
   * Removes an effect from the manager by its instance ID.
   * If the effect is associated with any actors, those actors are also removed.
   * @param instanceId The unique instance ID of the effect to be removed.
   */
  public removeEffect(instanceId: string): void {
    this.effects.delete(instanceId);
    this.removeActorsForEffect(instanceId);
  }

  /** Removes every active effect carrying the semantic tag. */
  public removeEffectsByTag(effectTag: string): number {
    let removed = 0;
    for (const [instanceId, effect] of this.effects.entries()) {
      if (effect.effectTag !== effectTag) continue;
      this.effects.delete(instanceId);
      this.removeActorsForEffect(instanceId);
      removed += 1;
    }
    return removed;
  }

  private removeActorsForEffect(instanceId: string): void {
    for (const [actorId, actor] of this.actors.entries()) {
      if (actor.sourceEffectInstanceId === instanceId) {
        this.actors.delete(actorId);
      }
    }
  }

  /**
   * Adds an actor to the manager.
   * Actors are typically associated with effects, and this method ensures that the actor is tracked alongside its corresponding effect.
   * @param actor The actor instance to be added to the manager.
   */
  public addActor(actor: ActorInstance): void {
    this.actors.set(actor.instanceId, actor);
  }

  /**
   * Adds multiple actors to the manager.
   * @param actors An array of actor instances to be added to the manager.
   */
  public addActors(actors: ActorInstance[]): void {
    for (const actor of actors) {
      this.addActor(actor);
    }
  }

  /**
   * Retrieves all active actors currently managed by the EffectManager.
   * @returns An array of active ActorInstance objects.
   */
  public getActiveActors(): ActorInstance[] {
    return Array.from(this.actors.values());
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
   * Triggered at the start of a character's turn.
   * It decrements the duration of any effects that are set to expire at the start of the turn.
   * If an effect's duration reaches zero, it is removed from the manager.
   */
  public tickTurnStart(): void {
    // iterate through all effects and handle those that expire at turn start or have a duration in rounds
    for (const [id, effect] of this.effects.entries()) {
      // 1 - handle effects that expire at the start of the turn
      if (effect.durationType === "turn_start") {
        this.effects.delete(id);
        this.removeActorsForEffect(id);
        // 2 - handle effects that have a duration in rounds
      } else if (
        effect.durationType === "rounds" &&
        effect.durationRemaining !== undefined
      ) {
        effect.durationRemaining -= 1;
        if (effect.durationRemaining <= 0) {
          this.effects.delete(id);
          this.removeActorsForEffect(id);
        }
      }
    }
  }

  /**
   * Triggered at the end of a character's turn.
   * It removes any effects that are set to expire at the end of the turn.
   * This method ensures that the EffectManager maintains an accurate state of active effects after each turn.
   */
  public tickTurnEnd(): void {
    // iterate through all effects and handle those that expire at turn end
    for (const [id, effect] of this.effects.entries()) {
      // handle effects that expire at the end of the turn
      if (effect.durationType === "turn_end") {
        this.effects.delete(id);
        this.removeActorsForEffect(id);
      }
    }
  }

  /**
   * Triggered when a character takes a short or long rest.
   * It removes any effects that are set to expire on a short or long rest, respectively.
   * This method ensures that the EffectManager maintains an accurate state of active effects after resting.
   * @param isLongRest A boolean indicating whether the rest is a long rest (true) or a short rest (false).
   * If true, effects with a duration type of "rest_long" will be removed;
   */
  public tickRest(isLongRest: boolean): void {
    // iterate through all effects and handle those that expire on rest
    for (const [id, effect] of this.effects.entries()) {
      // 1 - handle effects that expire on a short rest
      if (effect.durationType === "rest_short") {
        this.effects.delete(id);
        this.removeActorsForEffect(id);
      // 2 - handle effects that expire on a long rest
      } else if (isLongRest && effect.durationType === "rest_long") {
        this.effects.delete(id);
        for (const [actorId, actor] of this.actors.entries()) {
          if (actor.sourceEffectInstanceId === id) {
            this.actors.delete(actorId);
          }
        }
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

  public getActiveEffects(): ActiveEffect[] {
    return Array.from(this.effects.values());
  }

  // endregion
}

// endregion
