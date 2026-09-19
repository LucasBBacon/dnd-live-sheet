import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { getResourceMaxUses, resolveResourceRule } from "@project/engine";

/** A pool spent down from a maximum and refilled on a rest, like Rage. */
export interface ChargesFeature {
  kind: "charges";
  id: string;
  name: string;
  current: number;
  max: number;
  resetCondition: string;
  isDepleted: boolean;
}

/**
 * A pool counted up from zero and reset on a rest, like Relentless Rage's.
 * It has no maximum: the count is what raises the save's DC.
 */
export interface UsesFeature {
  kind: "uses";
  id: string;
  name: string;
  used: number;
  resetCondition: string;
}

export type FeaturePool = ChargesFeature | UsesFeature;

export const useFeatures = (): FeaturePool[] => {
  const operationalResources = useCharacterSheetStore(
    (state) => state.resources,
  );
  const totalLevel = useCharacterSheetStore((state) => state.level);

  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(
    () =>
      operationalResources.flatMap((opResource): FeaturePool[] => {
        const definition = resolveResourceRule(
          opResource.id,
          ruleSnapshot ?? undefined,
        );

        // failsafe: if the dictionary lacks the feature, ignore it
        if (!definition) return [];

        // counted, not spent: its maximum is 0 by design, so the guard below
        // hid it, and Relentless Rage's counter never rendered
        if (definition.mode === "uses") {
          return [
            {
              kind: "uses",
              id: opResource.id,
              name: definition.name,
              used: opResource.current,
              resetCondition: definition.resetCondition,
            },
          ];
        }

        const maxUses = getResourceMaxUses(
          definition,
          totalLevel,
          classLevels,
        );

        // failsafe: if character lost levels or doesn't meet requirements, hide it
        if (maxUses <= 0) return [];

        return [
          {
            kind: "charges",
            id: opResource.id,
            name: definition.name,
            current: Math.min(opResource.current, maxUses), // clamp to prevent overflow
            max: maxUses,
            resetCondition: definition.resetCondition,
            isDepleted: opResource.current <= 0,
          },
        ];
      }),
    [operationalResources, totalLevel, classLevels, ruleSnapshot],
  );
};
