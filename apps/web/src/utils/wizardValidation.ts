import type { ChoiceQuestion, LevelDecision } from "@project/engine";
import type { LevelUpPayload } from "@project/shared";
import { isQuestionAnswered } from "../components/wizard/choices/ChoicePicker";

/**
 * The level-up wizard's steps: overview and HP, one step per decision type
 * the level raises (in first-seen order), one Choices step, then review.
 *
 * The Choices step is always there - it asks the server's choiceQuestions,
 * and says so when there are none - so the resolver's own trait_selection
 * decisions get no step of their own.
 */
export const levelUpSteps = (decisions: LevelDecision[]): string[] => {
  const steps: string[] = ["overview", "hp_increase"];
  const seenTypes = new Set<string>();
  for (const decision of decisions) {
    if (decision.type === "trait_selection" || seenTypes.has(decision.type)) {
      continue;
    }
    seenTypes.add(decision.type);
    steps.push(decision.type); // 'subclass', 'asi_or_feat'
  }
  steps.push("choices", "review");
  return steps;
};

/** The picks a draft holds for a question, from the map its target routes through. */
export const draftPicksFor = (
  payload: Partial<LevelUpPayload>,
  question: ChoiceQuestion,
): string[] | undefined =>
  question.target === "class"
    ? payload.selectedTraits?.[question.id]
    : payload.traitSelections?.[question.id];

export const isStepComplete = (
  stepType: string,
  payload: Partial<LevelUpPayload>,
  decisions: LevelDecision[],
  choices: { questions: ChoiceQuestion[]; ready: boolean } = {
    questions: [],
    ready: true,
  },
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

    case "choices":
      // complete once the questions for the draft's current subclass and
      // feat have arrived and each has exactly its pickCount picks
      return (
        choices.ready &&
        choices.questions.every((question) =>
          isQuestionAnswered(question, draftPicksFor(payload, question)),
        )
      );

    default:
      return false;
  }
};
