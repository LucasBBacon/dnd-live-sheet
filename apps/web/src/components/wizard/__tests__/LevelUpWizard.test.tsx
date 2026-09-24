import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  validateAndSubmit: vi.fn(),
  cancelLevelUp: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

// one step, already complete: the commit button is on screen at once
vi.mock("../WizardStepRouter", () => ({ WizardStepRouter: () => null }));
vi.mock("../../../utils/wizardValidation", () => ({
  levelUpSteps: () => ["review"],
  isStepComplete: () => true,
}));

vi.mock("../../../store/levelUpStore", () => ({
  useLevelUpStore: () => ({
    isActive: true,
    progressionContext: { decisions: [] },
    draftPayload: { targetClassId: "class_fighter", newTotalLevel: 4 },
    choiceQuestions: [],
    questionsStatus: "ready",
    cancelLevelUp: mocks.cancelLevelUp,
    validateAndSubmit: mocks.validateAndSubmit,
  }),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: { id: string }) => unknown) =>
    selector({ id: "char_1" }),
}));

import { LevelUpWizard } from "../LevelUpWizard";

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<LevelUpWizard />);
  });
  return { container, root };
};

const commit = async (container: HTMLElement) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === "COMMIT LEVEL UP",
  );
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("LevelUpWizard submit (#104)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refetches the character once the level-up is stored", async () => {
    mocks.validateAndSubmit.mockResolvedValueOnce(undefined);
    const { container, root } = await render();

    await commit(container);

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["character", "char_1"],
    });

    root.unmount();
    container.remove();
  });

  it("refetches nothing when the level-up is refused", async () => {
    mocks.validateAndSubmit.mockRejectedValueOnce(new Error("refused"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const { container, root } = await render();

    await commit(container);

    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(container.textContent).toContain("refused");

    root.unmount();
    container.remove();
  });
});
