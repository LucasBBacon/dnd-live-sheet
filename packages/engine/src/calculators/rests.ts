import type { OperationalResource } from "../types/resources.js";
import { getResourceMaxUses } from "../utils/resourceRules.js";
import { resolveResourceRule } from "../rules/ruleLookup.js";

/**
 * The RestEngine class provides methods for applying the effects of rests (short or long) to a character's operational resources, such as hit points, spell slots, or other consumable resources.
 * It calculates the updated current values of these resources based on their defined reset conditions and maximum uses, taking into account the character's total level and class levels.
 * This class is designed to facilitate the management of resource recovery in a role-playing game context.
 */
export class RestEngine {
  /**
   * Applies the effects of a rest (short or long) to a list of operational resources, updating their current values based on their defined reset conditions and maximum uses.
   * This method takes into account the character's total level and class levels to determine the appropriate maximum uses for each resource,
   * and applies the rest effects accordingly.
   * @param resources An array of OperationalResource objects representing the character's current resources (e.g., hit points, spell slots, etc.) that will be affected by the rest.
   * @param restType A string indicating the type of rest being applied, either "short" or "long", which determines how resources are recovered based on their reset conditions.
   * @param totalLevel The character's total level, used to calculate maximum resource uses.
   * @param classLevels A record mapping class IDs to their respective levels, used to calculate maximum resource uses for class-specific resources.
   * @param snapshot An optional snapshot object containing resource rules, used to resolve resource metadata and reset conditions.
   * @returns An array of OperationalResource objects representing the updated resources after applying the rest effects.
   */
  public static applyRest(
    resources: OperationalResource[],
    restType: "short" | "long",
    totalLevel: number,
    classLevels: Record<string, number>,
    snapshot?: { resourcesById?: Record<string, ResourceRule> },
  ): OperationalResource[] {
    return resources.map((resource) => {
      const def = resolveResourceRule(resource.id, snapshot);

      // failsafe: not in dictionary, return untouched
      if (!def) return resource;

      const maxUses = getResourceMaxUses(def, totalLevel, classLevels);

      // 1 - short rest recovery
      if (restType === "short" && def.resetCondition === "short_rest") {
        return { ...resource, current: maxUses };
      }

      // 2 - long rest recovery
      if (restType === "long") {
        if (
          def.resetCondition === "short_rest" ||
          def.resetCondition === "long_rest"
        ) {
          return { ...resource, current: maxUses };
        }

        // dnd 5e: long rests recover exactly half of total max hit dice!!!! (min 1)
        if (def.resetCondition === "long_rest_half") {
          const recoveryAmount = Math.max(1, Math.floor(maxUses / 2));
          const newCurrent = Math.min(
            maxUses,
            resource.current + recoveryAmount,
          );
          return { ...resource, current: newCurrent };
        }
      }

      // ignore 'dawn' / 'never' TODO see what happens here
      return resource;
    });
  }
}
