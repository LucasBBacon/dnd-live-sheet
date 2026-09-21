import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useWizardStore } from "../../../store/wizardStore";
import { packRuleSnapshot } from "../../../store/__tests__/packFixture";
import { ChoicesStepContainer } from "../ChoicesStepContainer";

const mocks = vi.hoisted(() => ({
  queryData: { current: null as { snapshot: unknown } | null },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.queryData.current,
    isLoading: mocks.queryData.current === null,
    isError: false,
  }),
}));

// packRuleSnapshot() reads the real shipped pack, exactly what the
// production endpoint this step queries would serve.
mocks.queryData.current = { snapshot: packRuleSnapshot() };

const renderContainer = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ChoicesStepContainer />);
  });

  return container;
};

const fieldsetCheckboxes = (container: HTMLElement, fieldsetIndex: number) => {
  const fieldset = container.querySelectorAll("fieldset")[fieldsetIndex];
  return Array.from(
    fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
};

const clickCheckbox = async (
  container: HTMLElement,
  fieldsetIndex: number,
  checkboxIndex: number,
) => {
  await act(async () => {
    fieldsetCheckboxes(container, fieldsetIndex)[checkboxIndex].click();
  });
};

const findButtonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );

const setHumanFighterState = () => {
  useWizardStore.setState({
    currentStep: 6,
    campaignId: null,
    raceId: "race_human",
    subraceId: null,
    raceRequiresSubrace: false,
    classId: "class_fighter",
    subclassId: null,
    backgroundType: null,
    backgroundId: null,
    choiceAnswers: {},
  });
};

describe("ChoicesStepContainer", () => {
  beforeEach(() => {
    setHumanFighterState();
  });

  it("is inert while not the active step", async () => {
    useWizardStore.setState({ currentStep: 5 });
    const container = await renderContainer();
    expect(container.textContent).toBe("");
  });

  it("lists the human's language block and the fighter's fighting-style node", async () => {
    const container = await renderContainer();

    const headings = Array.from(container.querySelectorAll("h3")).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["Human", "Fighter"]);

    // known-good markers straight from listChoiceQuestions' own test suite:
    // the human language block offers Dwarvish, the fighting-style node
    // offers the Archery style.
    expect(container.textContent).toContain("Dwarvish");
    expect(container.textContent).toContain("Fighting Style: Archery");

    // language block + fighting-style node + the class's own starting-skill
    // block, none of which need a background to surface
    expect(container.querySelectorAll("fieldset")).toHaveLength(3);
  });

  it("disables Next until every question is answered, then enables it", async () => {
    const container = await renderContainer();

    expect(findButtonByText(container, "Awaiting Required Answers")?.disabled).toBe(
      true,
    );

    // fieldset 0: human_language_choice (pick 1) - "common" is held, so pick
    // the next option, dwarvish
    await clickCheckbox(container, 0, 1);
    // fieldset 1: fighter_level_1_fighting_style (pick 1)
    await clickCheckbox(container, 1, 0);
    // fieldset 2: fighter_starting_skills (pick 2)
    await clickCheckbox(container, 2, 0);
    await clickCheckbox(container, 2, 1);

    const nextButton = findButtonByText(container, "Review & Finalize Character");
    expect(nextButton?.disabled).toBe(false);
  });

  it("prunes a stored answer for a question id that is no longer asked", async () => {
    useWizardStore.setState({
      choiceAnswers: {
        some_retired_choice_id: { target: "trait", selected: ["whatever"] },
      },
    });

    await renderContainer();

    expect(
      useWizardStore.getState().choiceAnswers.some_retired_choice_id,
    ).toBeUndefined();
  });

  it("shows Nothing to choose with Next enabled when there is no race or class yet", async () => {
    useWizardStore.setState({ raceId: null, classId: null });

    const container = await renderContainer();

    expect(container.textContent).toContain("Nothing to choose");
    expect(findButtonByText(container, "►")?.disabled).toBe(false);
  });
});
