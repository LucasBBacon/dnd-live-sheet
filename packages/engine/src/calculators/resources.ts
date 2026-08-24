import type { Resource, ResourceMaxRule } from "@project/shared";

export type ResourceLevelProfile = {
  total?: number;
  classes: Record<string, number>;
};

export interface RuntimeResource {
  id: string;
  name: string;
  maxCharges: number;
  currentCharges: number;
  resetOn: Resource["resetCondition"];
}

// #region RESOURCE MANAGER

/**
 * ResourceManager tracks consumable character resources like spell slots,
 * ki points, and once-per-turn trait usages.
 */
export class ResourceManager {
  private resources: Map<string, RuntimeResource> = new Map();

  /**
   * Hydrates the manager from the static traits assigned to the character.
   * If a resource ID already exists (e.g., multiclassing grants spell slots),
   * it sums the max charges to handle combined pools safely.
   * @param grants Static trait resource grant to be processed.
   */
  public initializeFromGrants(
    grants: Resource[],
    levels: ResourceLevelProfile = { classes: {} },
  ): void {
    for (const grant of grants) {
      const maxCharges = this.resolveMaxCharges(grant.maxRule, levels);
      if (this.resources.has(grant.id)) {
        // handle overlapping pools (e.g., standard spellcasting accumulation)
        const existing = this.resources.get(grant.id);
        if (existing) {
          existing.maxCharges += maxCharges;
          existing.currentCharges = existing?.maxCharges;
        } else {
          console.error(`Resource exists but is not defined.`);
          return;
        }
      } else {
        this.resources.set(grant.id, {
          id: grant.id,
          name: grant.name,
          maxCharges,
          currentCharges: maxCharges,
          resetOn: grant.resetCondition,
        });
      }
    }
  }

  private resolveMaxCharges(
    maxRule: ResourceMaxRule,
    levels: ResourceLevelProfile,
  ): number {
    if (maxRule.kind === "fixed") return maxRule.value;

    if (maxRule.kind === "total_level_thresholds") {
      const totalLevel = levels.total ?? 0;
      return maxRule.thresholds.reduce(
        (resolved, threshold) =>
          totalLevel >= threshold.minimumLevel ? threshold.value : resolved,
        0,
      );
    }

    const classLevel = levels.classes[maxRule.classId] ?? 0;
    return maxRule.thresholds.reduce(
      (resolved, threshold) =>
        classLevel >= threshold.minimumLevel ? threshold.value : resolved,
      0,
    );
  }

  /**
   * Attempts to consume a resource.
   * @param id Resource id to be consumed.
   * @param amount Quantity of resource to be consumed.
   * @returns true if successful, false if insufficient charges.
   */
  public consume(id: string, amount: number = 1): boolean {
    const resource = this.resources.get(id);

    if (!resource) {
      console.error(`Resource ${id} not found in state.`);
      return false;
    }

    if (resource.currentCharges < amount) {
      return false; // insufficient resources, ActionResolver must abort
    }

    resource.currentCharges -= amount;
    return true;
  }

  /**
   * Restores a resource, capped at max.
   * @param id Resource id to be restored.
   * @param amount Quantity of resource to be restored.
   */
  public restore(id: string, amount: number): void {
    const resource = this.resources.get(id);
    if (resource) {
      resource.currentCharges = Math.min(
        resource.currentCharges + amount,
        resource.maxCharges,
      );
    }
  }

  public getRuntimeResources(): RuntimeResource[] {
    return Array.from(this.resources.values()).map((resource) => ({
      ...resource,
    }));
  }

  // region LIFECYCLE TRIGGERS

  /**
   * Triggered when a character takes a short or long rest.
   * It resets resources that are set to reset on short or long rests, respectively.
   * This method ensures that the ResourceManager maintains an accurate state of resources after resting.
   *
   * Must agree with rests.ts's restedCharges, the pure projection the web
   * store uses to preview a rest before committing it - both read the same
   * ResourceReset values, and a resource that recovers differently depending
   * on which of the two paths ticked it would be a live desync between the
   * store's preview and the engine's actual state.
   * @param isLongRest A boolean indicating whether the rest is a long rest (true) or a short rest (false).
   */
  public tickRest(isLongRest: boolean): void {
    for (const resource of this.resources.values()) {
      if (resource.resetOn === "short_rest") {
        resource.currentCharges = resource.maxCharges;
        continue;
      }

      if (!isLongRest) continue;

      if (resource.resetOn === "long_rest" || resource.resetOn === "dawn") {
        resource.currentCharges = resource.maxCharges;
      } else if (resource.resetOn === "long_rest_half") {
        // hit-dice style recovery: half of max, rounded down, minimum 1 -
        // same formula as rests.ts's restedCharges
        resource.currentCharges = Math.min(
          resource.maxCharges,
          resource.currentCharges +
            Math.max(1, Math.floor(resource.maxCharges / 2)),
        );
      }
    }
  }

  /**
   * Triggered at the start of a character's turn.
   */
  public tickStartOfTurn(): void {
    for (const resource of this.resources.values()) {
      if (resource.resetOn === "start_of_turn") {
        resource.currentCharges = resource.maxCharges;
      }
    }
  }

  // endregion
}

// endregion
