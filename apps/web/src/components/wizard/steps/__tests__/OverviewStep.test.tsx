import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { OverviewStep } from "../OverviewStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";

const optionsData = vi.hoisted(() => ({
  classes: [
    { id: "class_fighter", name: "Fighter" },
    { id: "class_wizard", name: "Wizard" },
  ],
  supportByClass: {
    class_fighter: {
      targetLevel: 4,
      isConfigured: true,
      reason: null,
      multiclassPrerequisitesMet: null,
      multiclassPrerequisiteReason: null,
    },
    class_wizard: {
      targetLevel: 1,
      isConfigured: true,
      reason: null,
      multiclassPrerequisitesMet: true,
      multiclassPrerequisiteReason: null,
    },
  },
  nextLevel: null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: optionsData, isLoading: false, isError: false }),
}));

const originalBeginLevelUp = useLevelUpStore.getState().beginLevelUp;
const beginLevelUp = vi.fn();

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<OverviewStep />);
  });
  return { container, root };
};

describe("OverviewStep (#95)", () => {
  beforeEach(() => {
    beginLevelUp.mockReset();
    // a row whose level column drifted to 7 while its ledger says fighter 3
    useCharacterSheetStore.setState({
      id: "char_1",
      campaignId: "camp_1",
      level: 7,
      classLevels: { class_fighter: 3 },
    });
    useLevelUpStore.setState({
      beginLevelUp,
      draftPayload: { targetClassId: "class_fighter" },
      progressionContext: null,
      grantedTraitDetails: [],
      errorMessage: null,
    });
  });

  afterEach(() => {
    useLevelUpStore.setState({ beginLevelUp: originalBeginLevelUp });
  });

  it("names the new total level from the class ledger", async () => {
    const { container, root } = await render();

    expect(container.textContent).toContain("Total Level 4");
    expect(container.textContent).not.toContain("Total Level 8");

    root.unmount();
    container.remove();
  });

  it("starts a switched class's level-up at the ledger's total plus one", async () => {
    const { container, root } = await render();
    const select = container.querySelector("select")!;

    await act(async () => {
      select.value = "class_wizard";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(beginLevelUp).toHaveBeenCalledWith(
      "char_1",
      "class_wizard",
      0,
      4,
      { campaignId: "camp_1" },
      optionsData.supportByClass.class_wizard,
    );

    root.unmount();
    container.remove();
  });
});
