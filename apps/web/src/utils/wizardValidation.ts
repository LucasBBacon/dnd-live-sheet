import type { LevelDecision } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";

export const isStepComplete = (
  stepType: string,
  payload: Partial<LevelUpPayload>,
  decisions: LevelDecision[],
): boolean => {
  switch (stepType) {
    case "overview":
    case "review":
      return true;

    case "hp_increase":
      return payload.hpRoll !== undefined && payload.hpRoll > 0;

    case "subclass": {
      // only requires if the engine requires it in this lvl
      const subclassDecision = decisions.find((d) => d.type === "subclass");
      return subclassDecision?.isRequired ? !!payload.subclassId : true;
    }

    case "asi_or_feat": {
      const asiDecision = decisions.find((d) => d.type === "asi_or_feat");
      if (!asiDecision?.isRequired) return true;

      const hasFeat = Boolean(payload.featId);
      const hasFullAsi =
        (payload.asiChoices?.reduce((sum, c) => sum + c.value, 0) ?? 0) === 2;

      return hasFeat || hasFullAsi;
    }

    default:
      return false;
  }
};
