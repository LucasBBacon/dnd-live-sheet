/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { getResourceMaxUses, resolveResourceRule } from "@project/engine";

export const useFeatures = () => {
  const operationalResources = useCharacterSheetStore(
    (state) => state.resources,
  );
  const totalLevel = useCharacterSheetStore((state) => state.level);

  // TODO: MAKE COME FROM CLASS LEDGER IN STORE
  // e.g., {'class_fighter': 3, 'class_wizard': 2}
  const classLevels = useCharacterSheetStore(
    (state) => state.classLevels || { class_fighter: totalLevel },
  );
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  return useMemo(() => {
    return operationalResources
      .map((opResource) => {
        const definition = resolveResourceRule(
          opResource.id,
          ruleSnapshot ?? undefined,
        );

        // failsafe: if the dictionary lacks the feature, ignore it
        if (!definition) return null;

        const maxUses = getResourceMaxUses(
          definition,
          totalLevel,
          classLevels,
        );

        // failsafe: if character lost levels or doesn't meet requirements, hide it
        if (maxUses <= 0) return null;

        return {
          id: opResource.id,
          name: definition.name,
          current: Math.min(opResource.current, maxUses), // clamp to prevent overflow
          max: maxUses,
          resetCondition: definition.resetCondition,
          isDepleted: opResource.current <= 0,
        };
      })
      .filter(Boolean) as any[]; // strip nulls
  }, [operationalResources, totalLevel, classLevels, ruleSnapshot]);
};
