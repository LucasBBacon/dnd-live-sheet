import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ArmorClassWidget } from "../ArmorClassWidget";

const mocks = vi.hoisted(() => ({
  activeStates: { current: [] as string[] },
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useDerivedStats: () => ({
    armorClass: {
      total: 17,
      breakdown: [
        { name: "Base AC (Unarmored Defense)", value: 10 },
        { name: "Dexterity Modifier", value: "+3" },
        { name: "Constitution Modifier", value: "+4" },
      ],
    },
  }),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: { activeStates: string[] }) => unknown,
  ) => selector({ activeStates: mocks.activeStates.current }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ArmorClassWidget />);
  });

  return container;
};

describe("ArmorClassWidget", () => {
  it("warns that attacks against you have advantage while you are exposed", async () => {
    mocks.activeStates.current = ["status_attacks_against_have_advantage"];

    const container = await renderWidget();

    expect(container.textContent).toContain(
      "Attacks against you have advantage",
    );
  });

  it("keeps the AC total visible alongside the warning", async () => {
    mocks.activeStates.current = ["status_attacks_against_have_advantage"];

    const container = await renderWidget();

    expect(container.textContent).toContain("17");
  });

  it("shows no warning when nothing has exposed you", async () => {
    mocks.activeStates.current = [];

    const container = await renderWidget();

    expect(container.textContent).not.toContain(
      "Attacks against you have advantage",
    );
  });
});
