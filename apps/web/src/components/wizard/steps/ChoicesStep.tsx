import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  choiceOptionLabel,
  type ChoiceQuestion,
  type LevelDecision,
  type RuleSnapshotLookup,
} from "@project/engine";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { fetchFullRulesSnapshot } from "../../../api/client";
import { ChoicePicker } from "../choices/ChoicePicker";

/**
 * Turns a level-up decision into the same `ChoiceQuestion` shape the
 * creation wizard's picker already knows how to render (Task 4), so
 * `ChoicePicker` needs no level-up-specific branch.
 *
 * `target` mirrors the decision's own `source`: a trait's own choice block
 * (`trait_choice_block`) is a "trait" question, everything else - a class
 * progression node such as a fighting style - is a "class" question. Both
 * are attributed to the class currently being levelled: this wizard only
 * ever asks about the one class in `draftPayload.targetClassId`.
 */
// This helper belongs beside the step that uses it, not split into a file of
// its own for one function; react-refresh only cares in dev builds.
// eslint-disable-next-line react-refresh/only-export-components
export const decisionToQuestion = (
  decision: LevelDecision,
  targetClassId: string,
  snapshot?: RuleSnapshotLookup,
): ChoiceQuestion => {
  const className = snapshot?.classesById?.[targetClassId]?.name ?? targetClassId;

  return {
    id: decision.id,
    target: decision.source === "trait_choice_block" ? "trait" : "class",
    classId: targetClassId,
    source: { kind: "class", id: targetClassId, name: className },
    prompt: decision.description,
    pickCount: decision.quantity ?? 1,
    options: (decision.options ?? []).map((optionId) => ({
      id: optionId,
      label: choiceOptionLabel(optionId, snapshot),
    })),
    selected: [],
    held: [],
  };
};

export const ChoicesStep = ({ decisions }: { decisions: LevelDecision[] }) => {
  const draftPayload = useLevelUpStore((state) => state.draftPayload);
  const updateDraft = useLevelUpStore((state) => state.updateDraft);
  const campaignId = useCharacterSheetStore((state) => state.campaignId);
  const targetClassId = draftPayload.targetClassId ?? "";

  const { data } = useQuery({
    queryKey: ["reference", "rules-snapshot-full", campaignId],
    queryFn: () => fetchFullRulesSnapshot({ campaignId }),
    staleTime: 1000 * 60 * 30, // reference data changes rarely
    enabled: Boolean(targetClassId),
  });

  const snapshot = data?.snapshot;

  const questions = useMemo(
    () =>
      decisions.map((decision) =>
        decisionToQuestion(decision, targetClassId, snapshot),
      ),
    [decisions, targetClassId, snapshot],
  );

  const handleChange = (decision: LevelDecision, selected: string[]) => {
    if (decision.source === "trait_choice_block") {
      updateDraft({
        traitSelections: { ...draftPayload.traitSelections, [decision.id]: selected },
      });
    } else {
      updateDraft({
        selectedTraits: { ...draftPayload.selectedTraits, [decision.id]: selected },
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Choices
      </h3>

      {questions.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No trait choices are required at this level.
        </p>
      ) : (
        questions.map((question, index) => {
          const decision = decisions[index]!;
          const stored =
            decision.source === "trait_choice_block"
              ? draftPayload.traitSelections?.[decision.id]
              : draftPayload.selectedTraits?.[decision.id];

          return (
            <ChoicePicker
              key={question.id}
              question={question}
              selected={stored ?? question.selected}
              onChange={(selected) => handleChange(decision, selected)}
            />
          );
        })
      )}
    </div>
  );
};
