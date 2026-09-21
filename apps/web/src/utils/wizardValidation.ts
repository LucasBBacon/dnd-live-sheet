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

    case "trait_selection": {
      const traitDecisions = decisions.filter(
        (d) => d.type === "trait_selection",
      );

      return traitDecisions.every((decision) => {
        const required = decision.quantity ?? 1;
        const picks =
          decision.source === "trait_choice_block"
            ? payload.traitSelections?.[decision.id]
            : payload.selectedTraits?.[decision.id];

        return (picks?.length ?? 0) === required;
      });
    }

    case "spell_selection":
      // the wizard cannot answer a spell choice yet (#79) - this step always
      // blocks progress, even when there is nothing left to pick
      return false;

    default:
      return false;
  }
};
