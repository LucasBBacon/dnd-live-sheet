import type { ChoiceQuestion } from "@project/engine";

// This predicate belongs beside the picker it describes, not split into a
// file of its own for one function; react-refresh only cares in dev builds.
// eslint-disable-next-line react-refresh/only-export-components
export const isQuestionAnswered = (
  question: ChoiceQuestion,
  selected: string[] | undefined,
): boolean => (selected ?? []).length === question.pickCount;

export const ChoicePicker = ({
  question,
  selected,
  onChange,
}: {
  question: ChoiceQuestion;
  selected: string[];
  onChange: (selected: string[]) => void;
}) => {
  const toggle = (optionId: string, checked: boolean) => {
    if (checked) {
      onChange([...selected, optionId]);
    } else {
      onChange(selected.filter((id) => id !== optionId));
    }
  };

  return (
    <fieldset className="border border-gray-300 rounded p-3 mb-3">
      <legend className="text-sm font-bold px-1">{question.prompt}</legend>
      <p className="text-xs text-gray-500 mb-2">
        {selected.length} / {question.pickCount}
      </p>
      <div className="flex flex-col gap-1">
        {question.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const isHeld = question.held.includes(option.id);
          const disabled =
            !isSelected &&
            (selected.length >= question.pickCount || isHeld);

          return (
            <label
              key={option.id}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={disabled}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              {option.label}
              {isHeld ? " (already known)" : ""}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
