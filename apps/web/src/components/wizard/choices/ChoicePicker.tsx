import { useState } from "react";
import { blockedOptionIds, type ChoiceQuestion } from "@project/engine";

// This predicate belongs beside the picker it describes, not split into a
// file of its own for one function; react-refresh only cares in dev builds.
// eslint-disable-next-line react-refresh/only-export-components
export const isQuestionAnswered = (
  question: ChoiceQuestion,
  selected: string[] | undefined,
): boolean => (selected ?? []).length === question.pickCount;

/**
 * Past this many options a question gets a name filter - a cantrip question
 * lists every cantrip the pack has.
 */
const FILTER_THRESHOLD = 12;

export const ChoicePicker = ({
  question,
  selected,
  onChange,
}: {
  question: ChoiceQuestion;
  selected: string[];
  onChange: (selected: string[]) => void;
}) => {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  // the filter narrows what is shown, never what is picked: a selected
  // option stays shown whatever the filter says
  const shown =
    needle === ""
      ? question.options
      : question.options.filter(
          (option) =>
            selected.includes(option.id) ||
            option.label.toLowerCase().includes(needle),
        );

  // held options and options with unmet prerequisites cannot be picked; one
  // that is already selected stays enabled so it can be unpicked
  const blocked = new Set(blockedOptionIds(question));

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
      {question.options.length > FILTER_THRESHOLD && (
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name"
          aria-label={`Filter: ${question.prompt}`}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
        />
      )}
      <div className="flex flex-col gap-1">
        {shown.map((option) => {
          const isSelected = selected.includes(option.id);
          const isHeld = question.held.includes(option.id);
          const disabled =
            !isSelected &&
            (selected.length >= question.pickCount || blocked.has(option.id));

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
              {isHeld
                ? " (already known)"
                : option.unmet
                  ? ` (${option.unmet.join(", ")})`
                  : ""}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
