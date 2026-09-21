import { useLevelUpStore } from "../../../store/levelUpStore";
import { draftPicksFor } from "../../../utils/wizardValidation";
import { ChoiceQuestionList } from "../choices/ChoiceQuestionList";

/**
 * The level-up wizard's one Choices step: the questions this level newly
 * asks, exactly as the server sends them (`choiceQuestions` - labels, full
 * rosters and `held` included), from the same before/after construction its
 * required check uses. A class question's answer goes to
 * `draftPayload.selectedTraits`, a trait question's to
 * `draftPayload.traitSelections`, each keyed by question id.
 */
export const ChoicesStep = () => {
  const draftPayload = useLevelUpStore((state) => state.draftPayload);
  const updateDraft = useLevelUpStore((state) => state.updateDraft);
  const questions = useLevelUpStore((state) => state.choiceQuestions);
  const questionsStatus = useLevelUpStore((state) => state.questionsStatus);
  const refreshChoiceQuestions = useLevelUpStore(
    (state) => state.refreshChoiceQuestions,
  );

  const answers = Object.fromEntries(
    questions.map((question) => [
      question.id,
      draftPicksFor(draftPayload, question) ?? [],
    ]),
  );

  const handleChange = (questionId: string, selected: string[]) => {
    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    if (question.target === "class") {
      updateDraft({
        selectedTraits: { ...draftPayload.selectedTraits, [question.id]: selected },
      });
    } else {
      updateDraft({
        traitSelections: { ...draftPayload.traitSelections, [question.id]: selected },
      });
    }
  };

  const body = () => {
    if (questionsStatus === "loading") {
      return <p className="text-sm text-gray-500 italic">Loading choices...</p>;
    }
    if (questionsStatus === "error") {
      return (
        <div className="text-sm text-red-700 flex items-center gap-3">
          <p>This level's choices could not be loaded.</p>
          <button
            onClick={() => void refreshChoiceQuestions()}
            className="px-3 py-1 font-bold border-2 border-red-300 rounded hover:border-red-500"
          >
            Retry
          </button>
        </div>
      );
    }
    if (questions.length === 0) {
      return <p className="text-sm text-gray-500 italic">Nothing to choose</p>;
    }
    return (
      <ChoiceQuestionList
        questions={questions}
        answers={answers}
        onChange={handleChange}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Choices
      </h3>
      {body()}
    </div>
  );
};
