import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act, useState } from "react";
import type { ChoiceQuestion } from "@project/engine";
import { ChoicePicker, isQuestionAnswered } from "../ChoicePicker";
import { ChoiceQuestionList } from "../ChoiceQuestionList";

const buildQuestion = (
  overrides: Partial<ChoiceQuestion> = {},
): ChoiceQuestion => ({
  id: "trait_choice_skills",
  target: "trait",
  source: { kind: "class", id: "fighter", name: "Fighter" },
  prompt: "Fighter: choose 2 skills",
  pickCount: 2,
  options: [
    { id: "skill_athletics", label: "Athletics" },
    { id: "skill_acrobatics", label: "Acrobatics" },
    { id: "skill_perception", label: "Perception" },
    { id: "skill_stealth", label: "Stealth" },
  ],
  selected: [],
  held: [],
  ...overrides,
});

const renderInto = async (element: React.ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return { container, root };
};

const checkboxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

// ChoicePicker is stateless - it hands the parent a new `selected` array and
// waits to be re-rendered with it. This harness plays that parent role for
// real, so clicking twice actually accumulates two picks instead of two
// independent single-pick calls each starting from an empty `selected`.
const StatefulHarness = ({
  question,
  onChangeCalls,
}: {
  question: ChoiceQuestion;
  onChangeCalls: string[][];
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ChoicePicker
      question={question}
      selected={selected}
      onChange={(next) => {
        onChangeCalls.push(next);
        setSelected(next);
      }}
    />
  );
};

describe("ChoicePicker", () => {
  it("renders one checkbox per option and a 0 / pickCount counter", async () => {
    const question = buildQuestion();

    const { container } = await renderInto(
      <ChoicePicker question={question} selected={[]} onChange={() => {}} />,
    );

    expect(checkboxes(container)).toHaveLength(4);
    expect(container.textContent).toContain("0 / 2");
  });

  it("calls onChange with both picked ids, preserving the order clicked", async () => {
    const question = buildQuestion();
    const calls: string[][] = [];

    const { container } = await renderInto(
      <StatefulHarness question={question} onChangeCalls={calls} />,
    );

    await act(async () => {
      checkboxes(container)[2].click(); // perception, clicked first
    });

    await act(async () => {
      checkboxes(container)[0].click(); // athletics, clicked second
    });

    // click order, not option order: perception before athletics even
    // though athletics is the earlier option in the list.
    expect(calls[calls.length - 1]).toEqual([
      "skill_perception",
      "skill_athletics",
    ]);
  });

  it("re-rendered with two selected disables the unchecked boxes and shows 2 / 2", async () => {
    const question = buildQuestion();

    const { container, root } = await renderInto(
      <ChoicePicker question={question} selected={[]} onChange={() => {}} />,
    );

    await act(async () => {
      root.render(
        <ChoicePicker
          question={question}
          selected={["skill_athletics", "skill_acrobatics"]}
          onChange={() => {}}
        />,
      );
    });

    const boxes = checkboxes(container);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].disabled).toBe(true);
    expect(boxes[3].disabled).toBe(true);
    expect(container.textContent).toContain("2 / 2");
  });

  it("unchecking a selected box re-enables the others", async () => {
    const question = buildQuestion();
    const calls: string[][] = [];

    const { container, root } = await renderInto(
      <ChoicePicker
        question={question}
        selected={["skill_athletics", "skill_acrobatics"]}
        onChange={(next) => calls.push(next)}
      />,
    );

    const boxes = checkboxes(container);
    await act(async () => {
      boxes[0].click();
    });

    expect(calls[0]).toEqual(["skill_acrobatics"]);

    await act(async () => {
      root.render(
        <ChoicePicker
          question={question}
          selected={["skill_acrobatics"]}
          onChange={(next) => calls.push(next)}
        />,
      );
    });

    const reRendered = checkboxes(container);
    expect(reRendered[2].disabled).toBe(false);
    expect(reRendered[3].disabled).toBe(false);
  });

  it("renders a held option disabled and labelled already known", async () => {
    const question = buildQuestion({ held: ["skill_athletics"] });

    const { container } = await renderInto(
      <ChoicePicker question={question} selected={[]} onChange={() => {}} />,
    );

    const boxes = checkboxes(container);
    expect(boxes[0].disabled).toBe(true);
    expect(container.textContent).toContain("already known");
  });
});

describe("ChoiceQuestionList", () => {
  it("groups questions under their source.name headings in the given order", async () => {
    const questions: ChoiceQuestion[] = [
      buildQuestion({
        id: "trait_choice_skills",
        source: { kind: "class", id: "fighter", name: "Fighter" },
      }),
      buildQuestion({
        id: "trait_choice_tools",
        source: { kind: "race", id: "dwarf", name: "Dwarf" },
        prompt: "Dwarf: choose 1 tool",
        pickCount: 1,
      }),
      buildQuestion({
        id: "trait_choice_lang",
        source: { kind: "race", id: "dwarf", name: "Dwarf" },
        prompt: "Dwarf: choose 1 language",
        pickCount: 1,
      }),
    ];

    const { container } = await renderInto(
      <ChoiceQuestionList questions={questions} answers={{}} onChange={() => {}} />,
    );

    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["Fighter", "Dwarf"]);

    const fieldsets = container.querySelectorAll("fieldset");
    expect(fieldsets).toHaveLength(3);
  });

  it("passes each question's stored answer through to onChange by question id", async () => {
    const questions: ChoiceQuestion[] = [buildQuestion()];
    const calls: Array<[string, string[]]> = [];

    const { container } = await renderInto(
      <ChoiceQuestionList
        questions={questions}
        answers={{ trait_choice_skills: ["skill_athletics"] }}
        onChange={(questionId, selected) => calls.push([questionId, selected])}
      />,
    );

    const boxes = checkboxes(container);
    expect(boxes[0].checked).toBe(true);

    await act(async () => {
      boxes[1].click();
    });

    expect(calls[0]).toEqual([
      "trait_choice_skills",
      ["skill_athletics", "skill_acrobatics"],
    ]);
  });
});

describe("isQuestionAnswered", () => {
  it("is true only when selected has exactly pickCount entries", () => {
    const question = buildQuestion({ pickCount: 2 });

    expect(isQuestionAnswered(question, undefined)).toBe(false);
    expect(isQuestionAnswered(question, [])).toBe(false);
    expect(isQuestionAnswered(question, ["skill_athletics"])).toBe(false);
    expect(
      isQuestionAnswered(question, ["skill_athletics", "skill_acrobatics"]),
    ).toBe(true);
    expect(
      isQuestionAnswered(question, [
        "skill_athletics",
        "skill_acrobatics",
        "skill_perception",
      ]),
    ).toBe(false);
  });
});
