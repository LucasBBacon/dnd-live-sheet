import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChoiceQuestions } from "@project/engine";
import { useWizardStore } from "../../store/wizardStore";
import { fetchFullRulesSnapshot } from "../../api/client";
import { buildDraftSave } from "../../utils/draftSave";
import { ChoiceQuestionList } from "./choices/ChoiceQuestionList";
import { isQuestionAnswered } from "./choices/ChoicePicker";

export const ChoicesStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const campaignId = useWizardStore((state) => state.campaignId);
  const choiceAnswers = useWizardStore((state) => state.choiceAnswers);
  const setChoiceAnswer = useWizardStore((state) => state.setChoiceAnswer);
  const pruneChoiceAnswers = useWizardStore(
    (state) => state.pruneChoiceAnswers,
  );
  const state = useWizardStore();
  const isActiveStep = currentStep === 6;

  const { data } = useQuery({
    queryKey: ["reference", "rules-snapshot-full", campaignId],
    queryFn: () => fetchFullRulesSnapshot({ campaignId }),
    staleTime: 1000 * 60 * 30, // reference data changes rarely
    enabled: isActiveStep,
  });

  const save = buildDraftSave(state);

  // Answers only ever fill `selected` - a class trait_choice pick can itself
  // unlock further questions (e.g. a subclass feature choosing its own
  // sub-options), which is correct: the save is rebuilt from the store on
  // every answer, so the question list settles once nothing new unlocks.
  const questions = useMemo(
    () => (save && data ? listChoiceQuestions(save, data.snapshot) : []),
    [save, data],
  );

  useEffect(() => {
    pruneChoiceAnswers(questions.map((question) => question.id));
  }, [questions, pruneChoiceAnswers]);

  // guard clause so react does not evaluate hidden steps
  if (!isActiveStep) return null;

  const answers = Object.fromEntries(
    Object.entries(choiceAnswers).map(([id, answer]) => [
      id,
      answer.selected,
    ]),
  );

  const allAnswered = questions.every((question) =>
    isQuestionAnswered(question, choiceAnswers[question.id]?.selected),
  );

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
        {questions.length === 0 ? (
          <p>Nothing to choose</p>
        ) : (
          <ChoiceQuestionList
            questions={questions}
            answers={answers}
            onChange={(questionId, selected) => {
              const question = questions.find((q) => q.id === questionId);
              if (question) setChoiceAnswer(question, selected);
            }}
          />
        )}
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
