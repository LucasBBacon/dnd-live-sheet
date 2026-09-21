import type { ChoiceQuestion } from "@project/engine";
import { ChoicePicker } from "./ChoicePicker";

interface QuestionGroup {
  sourceId: string;
  sourceName: string;
  questions: ChoiceQuestion[];
}

const groupBySource = (questions: ChoiceQuestion[]): QuestionGroup[] => {
  const groups: QuestionGroup[] = [];

  for (const question of questions) {
    const current = groups[groups.length - 1];
    if (current && current.sourceId === question.source.id) {
      current.questions.push(question);
    } else {
      groups.push({
        sourceId: question.source.id,
        sourceName: question.source.name,
        questions: [question],
      });
    }
  }

  return groups;
};

export const ChoiceQuestionList = ({
  questions,
  answers,
  onChange,
}: {
  questions: ChoiceQuestion[];
  answers: Record<string, string[]>;
  onChange: (questionId: string, selected: string[]) => void;
}) => (
  <div className="flex flex-col gap-4">
    {groupBySource(questions).map((group) => (
      <div key={group.sourceId}>
        <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-2 uppercase">
          {group.sourceName}
        </h3>
        {group.questions.map((question) => (
          <ChoicePicker
            key={question.id}
            question={question}
            selected={answers[question.id] ?? question.selected}
            onChange={(selected) => onChange(question.id, selected)}
          />
        ))}
      </div>
    ))}
  </div>
);
