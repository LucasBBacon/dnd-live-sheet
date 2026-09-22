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

// React tracks a controlled input's value itself, so a test sets it through
// the native setter and fires "input" for onChange to see the change
const typeInto = async (input: HTMLInputElement, text: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const optionLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("label")).map(
    (label) => label.textContent,
  );

const filterBox = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="search"]');

/** thirteen options - one past the filter threshold */
const spellQuestion = buildQuestion({
  id: "cleric_level_1_cantrips",
  target: "class",
  prompt: "Cleric: choose 3 cantrip(s)",
  pickCount: 3,
  options: [
    "Bless",
    "Burning Hands",
    "Fireball",
    "Fire Shield",
    "Guidance",
    "Light",
    "Mending",
    "Resistance",
    "Sacred Flame",
    "Spare the Dying",
    "Thaumaturgy",
    "Toll the Dead",
    "Word of Radiance",
  ].map((label) => ({
    id: `spell_${label.toLowerCase().replace(/ /g, "_")}`,
    label,
  })),
});

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

describe("ChoicePicker's name filter", () => {
  it("is not shown for a question with 12 or fewer options", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={buildQuestion()} selected={[]} onChange={() => {}} />,
    );

    expect(filterBox(container)).toBeNull();
  });

  it("narrows a long question's options by name, ignoring case", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={spellQuestion} selected={[]} onChange={() => {}} />,
    );

    await typeInto(filterBox(container)!, "FIRE");

    expect(optionLabels(container)).toEqual(["Fireball", "Fire Shield"]);
  });

  it("keeps a selected option shown and checked when the filter excludes it", async () => {
    const { container } = await renderInto(
      <ChoicePicker
        question={spellQuestion}
        selected={["spell_bless"]}
        onChange={() => {}}
      />,
    );

    await typeInto(filterBox(container)!, "fire");

    expect(optionLabels(container)).toEqual(["Bless", "Fireball", "Fire Shield"]);
    expect(checkboxes(container)[0].checked).toBe(true);
  });
});

describe("ChoicePicker - unmet prerequisites", () => {
  const invocations = buildQuestion({
    id: "warlock_level_2_invocations",
    target: "class",
    prompt: "Warlock: choose 2",
    pickCount: 2,
    options: [
      {
        id: "trait_invocation_agonizing_blast",
        label: "Agonizing Blast",
        unmet: ["needs Eldritch Blast"],
      },
      { id: "trait_invocation_armor_of_shadows", label: "Armor of Shadows" },
      {
        id: "trait_invocation_thirsting_blade",
        label: "Thirsting Blade",
        unmet: ["needs Warlock level 5", "needs Pact of the Blade"],
      },
    ],
  });

  it("disables an option with unmet prerequisites and says why", async () => {
    const { container } = await renderInto(
      <ChoicePicker question={invocations} selected={[]} onChange={() => {}} />,
    );

    const boxes = checkboxes(container);
    expect(boxes[0].disabled).toBe(true);
    expect(boxes[1].disabled).toBe(false);
    expect(boxes[2].disabled).toBe(true);
    expect(container.textContent).toContain("Agonizing Blast (needs Eldritch Blast)");
    expect(container.textContent).toContain(
      "Thirsting Blade (needs Warlock level 5, needs Pact of the Blade)",
    );
  });

  it("keeps a selected unmet option enabled so it can be unpicked", async () => {
    const { container } = await renderInto(
      <ChoicePicker
        question={invocations}
        selected={["trait_invocation_agonizing_blast"]}
        onChange={() => {}}
      />,
    );

    expect(checkboxes(container)[0].checked).toBe(true);
    expect(checkboxes(container)[0].disabled).toBe(false);
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
