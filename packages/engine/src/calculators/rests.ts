import { RESOURCE_DICTIONARY } from "../rules/resourceDictionary.js";
import type { OperationalResource } from "../types/resources.js";
import { getResourceMaxUses } from "../utils/resourceRules.js";

export class RestEngine {
  public static applyRest(
    resources: OperationalResource[],
    restType: "short" | "long",
    totalLevel: number,
    classLevels: Record<string, number>,
  ): OperationalResource[] {
    return resources.map((resource) => {
      const def = RESOURCE_DICTIONARY[resource.id];

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
