import type { ResourceGrant } from "@project/shared";

export interface RuntimeResource {
  id: string;
  name: string;
  maxCharges: number;
  currentCharges: number;
  resetOn: ResourceGrant["resetOn"];
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
  public initializeFromGrants(grants: ResourceGrant[]): void {
    for (const grant of grants) {
      if (this.resources.has(grant.id)) {
        // handle overlapping pools (e.g., standard spellcasting accumulation)
        const existing = this.resources.get(grant.id);
        if (existing) {
          existing.maxCharges += grant.maxCharges;
          existing.currentCharges = existing?.maxCharges;
        } else {
          console.error(`Resource exists but is not defined.`);
          return;
        }
      } else {
        this.resources.set(grant.id, {
          id: grant.id,
          name: grant.name,
          maxCharges: grant.maxCharges,
          currentCharges: grant.maxCharges,
          resetOn: grant.resetOn,
        });
      }
    }
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

  // region LIFECYCLE TRIGGERS

  public tickRest(isLongRest: boolean): void {
    for (const resource of this.resources.values()) {
      if (
        resource.resetOn === "short_rest" ||
        (isLongRest && resource.resetOn === "long_rest") ||
        (isLongRest && resource.resetOn === "dawn")
      ) {
        resource.currentCharges = resource.maxCharges;
      }
    }
  }

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
