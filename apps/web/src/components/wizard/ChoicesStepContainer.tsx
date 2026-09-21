import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { listChoiceQuestions } from "@project/engine";
import { useWizardStore } from "../../store/wizardStore";
import { fetchFullRulesSnapshot } from "../../api/client";
import { buildDraftSave, type DraftSaveInputs } from "../../utils/draftSave";
import { ChoiceQuestionList } from "./choices/ChoiceQuestionList";
import { isQuestionAnswered } from "./choices/ChoicePicker";

export const ChoicesStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const campaignId = useWizardStore((state) => state.campaignId);
  const setChoiceAnswer = useWizardStore((state) => state.setChoiceAnswer);
  const pruneChoiceAnswers = useWizardStore(
    (state) => state.pruneChoiceAnswers,
  );
  const isActiveStep = currentStep === 6;

  // Only the fields buildDraftSave actually reads - selected together with
  // useShallow so this hook (and everything derived from it below) is inert
  // to any other store change, e.g. typing the character name at step 1.
  // Zustand keeps returning the same object reference across renders unless
  // one of these fields itself changed.
  const draftInputs = useWizardStore(
    useShallow(
      (state): DraftSaveInputs => ({
        raceId: state.raceId,
        subraceId: state.subraceId,
        raceRequiresSubrace: state.raceRequiresSubrace,
        classId: state.classId,
        subclassId: state.subclassId,
        backgroundType: state.backgroundType,
        backgroundId: state.backgroundId,
        baseAbilityScores: state.baseAbilityScores,
        choiceAnswers: state.choiceAnswers,
      }),
    ),
  );
  const choiceAnswers = draftInputs.choiceAnswers;

  const { data, isError } = useQuery({
    queryKey: ["reference", "rules-snapshot-full", campaignId],
    queryFn: () => fetchFullRulesSnapshot({ campaignId }),
    staleTime: 1000 * 60 * 30, // reference data changes rarely
    enabled: isActiveStep,
  });

  const save = useMemo(() => buildDraftSave(draftInputs), [draftInputs]);

  // Answers only ever fill `selected` - a class trait_choice pick can itself
  // unlock further questions (e.g. a subclass feature choosing its own
  // sub-options), which is correct: the save is rebuilt from the store on
  // every answer, so the question list settles once nothing new unlocks.
  // Gated on isActiveStep too: no engine work happens while this step is
  // hidden, even if a race, class and snapshot are already in hand.
  const questions = useMemo(
    () =>
      isActiveStep && save && data
        ? listChoiceQuestions(save, data.snapshot)
        : [],
    [isActiveStep, save, data],
  );

  useEffect(() => {
    // do not prune while hidden, or before the snapshot has loaded:
    // `questions` collapses to `[]` above in both cases, and pruning
    // against that would wipe every stored answer
    if (!isActiveStep || !data) return;
    pruneChoiceAnswers(questions);
  }, [isActiveStep, data, questions, pruneChoiceAnswers]);

  // Hooks above must still run on every render regardless of step (that is
  // what isActiveStep guards inside them are for) - this only skips
  // rendering the step's own markup while it is hidden.
  if (!isActiveStep) return null;

  const answers = Object.fromEntries(
    Object.entries(choiceAnswers).map(([id, answer]) => [
      id,
      answer.selected,
    ]),
  );

  // until the snapshot is in hand there is no question list to judge, so
  // Next stays disabled rather than reading an empty list as "all answered"
  const allAnswered =
    Boolean(data) &&
    questions.every((question) =>
      isQuestionAnswered(question, choiceAnswers[question.id]?.selected),
    );

  const body = () => {
    if (!data) {
      return isError ? (
        <p>This step's choices could not be loaded. Go back and try again.</p>
      ) : (
        <p>Loading choices...</p>
      );
    }
    if (questions.length === 0) return <p>Nothing to choose</p>;
    return (
      <ChoiceQuestionList
        questions={questions}
        answers={answers}
        onChange={(questionId, selected) => {
          const question = questions.find((q) => q.id === questionId);
          if (question) setChoiceAnswer(question, selected);
        }}
      />
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "80vh",
        fontFamily: "monospace",
      }}
    >
      <h2>Choices</h2>

      <div style={{ flexGrow: 1, overflowY: "auto", paddingBottom: "1rem" }}>
        {body()}
      </div>

      {/* Navigation Boundaries */}
      <div
        style={{
          borderTop: "1px solid #333",
          paddingTop: "1rem",
          display: "flex",
          gap: "1rem",
          marginTop: "auto",
        }}
      >
        <button
          onClick={() => setStep(5)}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: "pointer",
            background: "#e0e0e0",
            border: "none",
          }}
        >
          ◄ Return to Background
        </button>
        <button
          disabled={!allAnswered}
          onClick={() => setStep(7)}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: allAnswered ? "pointer" : "not-allowed",
            background: allAnswered ? "#ccffcc" : "#ffcccc",
            border: "none",
            flexGrow: 1,
            fontWeight: "bold",
          }}
        >
          {allAnswered
            ? "Review & Finalize Character ►"
            : "Awaiting Required Answers..."}
        </button>
      </div>
    </div>
  );
};
