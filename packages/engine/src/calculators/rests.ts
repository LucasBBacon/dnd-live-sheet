import type { CharacterResource } from "../types/resources.js";

export class RestEngine {
  public static applyRest(
    resources: CharacterResource[],
    restType: "short" | "long",
  ): CharacterResource[] {
    return resources.map((resource) => {
      // 1 - short rest recovery
      if (restType === "short" && resource.resetCondition === "short_rest") {
        return { ...resource, current: resource.max };
      }

      // 2 - long rest recovery
      if (restType === "long") {
        if (
          resource.resetCondition === "short_rest" ||
          resource.resetCondition === "long_rest"
        ) {
          return { ...resource, current: resource.max };
        }

        // dnd 5e: long rests recover exactly half of total max hit dice!!!! (min 1)
        if (resource.resetCondition === "long_rest_half") {
          const recoveryAmount = Math.max(1, Math.floor(resource.max / 2));
          const newCurrent = Math.min(
            resource.max,
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
