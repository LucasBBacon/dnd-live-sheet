import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { CONDITION_IDS } from "@project/shared";
import { ConditionsWidget } from "../ConditionsWidget";

const mocks = vi.hoisted(() => ({
  activeConditions: { current: [] as string[] },
  toggleCondition: vi.fn(),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: {
      activeConditions: string[];
      toggleCondition: typeof mocks.toggleCondition;
    }) => unknown,
  ) =>
    selector({
      activeConditions: mocks.activeConditions.current,
      toggleCondition: mocks.toggleCondition,
    }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ConditionsWidget />);
  });

  return container;
};

describe("ConditionsWidget", () => {
  it("offers a chip for every condition the engine understands", async () => {
    mocks.activeConditions.current = [];

    const container = await renderWidget();

    expect(container.querySelectorAll("button")).toHaveLength(
      CONDITION_IDS.length,
    );
  });

  it("names each condition for the player", async () => {
    mocks.activeConditions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("Blinded");
    expect(container.textContent).toContain("Incapacitated");
  });

  it("reports which conditions are currently held", async () => {
    mocks.activeConditions.current = ["blinded"];

    const container = await renderWidget();

    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent).toContain("Blinded");
  });

  it("asks the store to toggle the condition that was clicked", async () => {
    mocks.activeConditions.current = [];
    mocks.toggleCondition.mockClear();

    const container = await renderWidget();

    const blinded = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Blinded"),
    );

    await act(async () => {
      blinded?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.toggleCondition).toHaveBeenCalledWith("blinded");
  });

  it("explains what a condition does, so the player need not look it up", async () => {
    mocks.activeConditions.current = [];

    const container = await renderWidget();

    const blinded = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Blinded"),
    );

    expect(blinded?.getAttribute("title")).toContain("cannot see");
  });
});
