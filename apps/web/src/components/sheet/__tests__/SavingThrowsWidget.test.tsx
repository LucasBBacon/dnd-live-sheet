import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { DerivedSave } from "@project/engine";
import { SavingThrowsWidget } from "../SavingThrowsWidget";

const mocks = vi.hoisted(() => ({
  saves: { current: {} as Record<string, unknown> },
  rollCheck: vi.fn(),
}));

vi.mock("../../../hooks/useCheckRoll", () => ({
  useCheckRoll: () => mocks.rollCheck,
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useDerivedStats: () => ({ saves: mocks.saves.current }),
}));

const makeSave = (overrides: Partial<DerivedSave> = {}): DerivedSave =>
  ({
    ability: "DEX",
    totalModifier: 2,
    isProficient: false,
    rollState: "normal",
    conditionalNotes: [],
    breakdown: "DEX (+2)",
    ...overrides,
  }) as DerivedSave;

const allSaves = (overrides: Record<string, Partial<DerivedSave>> = {}) =>
  Object.fromEntries(
    (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((ability) => [
      ability,
      makeSave({ ability, ...overrides[ability] }),
    ]),
  );

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SavingThrowsWidget />);
  });

  return container;
};

describe("SavingThrowsWidget", () => {
  it("lists every ability", async () => {
    mocks.saves.current = allSaves();

    const container = await renderWidget();

    for (const ability of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
      expect(container.textContent).toContain(ability);
    }
  });

  it("signs a positive modifier so it reads as a bonus", async () => {
    mocks.saves.current = allSaves({ DEX: { totalModifier: 2 } });

    const container = await renderWidget();

    expect(container.textContent).toContain("+2");
  });

  it("signs a negative modifier", async () => {
    mocks.saves.current = allSaves({ STR: { totalModifier: -1 } });

    const container = await renderWidget();

    expect(container.textContent).toContain("-1");
  });

  it("marks a proficient save", async () => {
    mocks.saves.current = allSaves({ STR: { isProficient: true } });

    const container = await renderWidget();

    const proficient = container.querySelectorAll('[data-proficient="true"]');
    expect(proficient).toHaveLength(1);
  });

  it("flags a save rolled with advantage", async () => {
    mocks.saves.current = allSaves({ DEX: { rollState: "advantage" } });

    const container = await renderWidget();

    expect(container.textContent).toContain("ADV");
  });

  it("flags a save rolled with disadvantage", async () => {
    mocks.saves.current = allSaves({ CON: { rollState: "disadvantage" } });

    const container = await renderWidget();

    expect(container.textContent).toContain("DIS");
  });

  it("shows no roll-state flag on ordinary saves", async () => {
    mocks.saves.current = allSaves();

    const container = await renderWidget();

    expect(container.textContent).not.toContain("ADV");
    expect(container.textContent).not.toContain("DIS");
  });

  it("spells out a conditional rider and names its source", async () => {
    mocks.saves.current = allSaves({
      DEX: {
        conditionalNotes: [
          {
            source: "Danger Sense",
            appliesWhen: "against effects that you can see",
            type: "advantage",
          },
        ],
      },
    });

    const container = await renderWidget();

    expect(container.textContent).toContain(
      "against effects that you can see",
    );
    expect(container.textContent).toContain("Danger Sense");
  });

  it("shows no rider text when nothing qualifies a save", async () => {
    mocks.saves.current = allSaves();

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Danger Sense");
  });
});

describe("SavingThrowsWidget rolling", () => {
  it("offers a roll for each ability", async () => {
    mocks.saves.current = allSaves();

    const container = await renderWidget();

    expect(container.querySelectorAll("button")).toHaveLength(6);
  });

  it("rolls the save with its own modifier", async () => {
    mocks.saves.current = allSaves({ DEX: { totalModifier: 4 } });
    mocks.rollCheck.mockClear();

    const container = await renderWidget();
    const dexButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("data-ability") === "DEX",
    );

    await act(async () => {
      dexButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.rollCheck).toHaveBeenCalledWith({
      label: "Dexterity save",
      modifier: 4,
      target: "SAVING_THROW",
    });
  });
});
