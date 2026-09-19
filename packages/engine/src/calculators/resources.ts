import type { Resource, ResourceMaxRule } from "@project/shared";

export type ResourceLevelProfile = { total?: number; classes: Record<string, number> };

export interface RuntimeResource {
  id: string;
  name: string;
  maxCharges: number;
  currentCharges: number;
  resetOn: Resource["resetCondition"];
  mode?: Resource["mode"];
}

export class ResourceManager {
  private resources: Map<string, RuntimeResource> = new Map();

  public initializeFromGrants(
    grants: Resource[],
    levels: ResourceLevelProfile = { classes: {} },
  ): void {
    for (const grant of grants) {
      const maxCharges =
        grant.mode === "uses" ? 0 : this.resolveMaxCharges(grant.maxRule, levels);
      if (this.resources.has(grant.id)) {
        const existing = this.resources.get(grant.id);
        if (existing) {
          existing.maxCharges += maxCharges;
          existing.currentCharges = existing.maxCharges;
        }
      } else {
        this.resources.set(grant.id, {
          id: grant.id,
          name: grant.name,
          maxCharges,
          currentCharges: grant.mode === "uses" ? 0 : maxCharges,
          resetOn: grant.resetCondition,
          ...(grant.mode !== undefined && { mode: grant.mode }),
        });
      }
    }
  }

  public hydrateFromPersisted(persisted: RuntimeResource[]): void {
    this.resources = new Map(
      persisted.map((resource) => [resource.id, { ...resource }]),
    );
  }

  private resolveMaxCharges(
    maxRule: ResourceMaxRule | undefined,
    levels: ResourceLevelProfile,
  ): number {
    if (!maxRule) return 0;
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

  public consume(id: string, amount: number = 1): boolean {
    const resource = this.resources.get(id);
    if (!resource) return false;
    if (resource.mode === "uses") {
      resource.currentCharges += amount;
      return true;
    }
    if (resource.currentCharges < amount) return false;
    resource.currentCharges -= amount;
    return true;
  }

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
    return Array.from(this.resources.values()).map((resource) => ({ ...resource }));
  }

  public tickRest(isLongRest: boolean): void {
    for (const resource of this.resources.values()) {
      if (resource.resetOn === "short_rest") {
        resource.currentCharges = resource.mode === "uses" ? 0 : resource.maxCharges;
        continue;
      }
      if (!isLongRest) continue;
      if (resource.resetOn === "long_rest" || resource.resetOn === "dawn") {
        resource.currentCharges = resource.mode === "uses" ? 0 : resource.maxCharges;
      } else if (resource.resetOn === "long_rest_half") {
        resource.currentCharges = Math.min(
          resource.maxCharges,
          resource.currentCharges + Math.max(1, Math.floor(resource.maxCharges / 2)),
        );
      }
    }
  }

  public tickStartOfTurn(): void {
    for (const resource of this.resources.values()) {
      if (resource.resetOn === "start_of_turn") {
        resource.currentCharges = resource.mode === "uses" ? 0 : resource.maxCharges;
      }
    }
  }
}
