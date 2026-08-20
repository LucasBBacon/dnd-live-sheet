import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SkillsWidget } from "../SkillsWidget";

const mocks = vi.hoisted(() => ({
  skills: {
    current: [] as Array<{
      id: string;
      name: string;
      totalModifier: number;
      multiplier: number;
    }>,
  },
  rollCheck: vi.fn(),
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useDerivedStats: () => ({ skills: mocks.skills.current }),
}));

vi.mock("../../../hooks/useCheckRoll", () => ({
  useCheckRoll: () => mocks.rollCheck,
}));

const skill = (
  overrides: Partial<(typeof mocks.skills.current)[number]> = {},
) => ({
  id: "stealth",
  name: "Stealth",
  totalModifier: 5,
  multiplier: 1,
  ...overrides,
});

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SkillsWidget />);
  });

  return container;
};

describe("SkillsWidget", () => {
  it("lists each skill by name", async () => {
    mocks.skills.current = [skill(), skill({ id: "arcana", name: "Arcana" })];

    const container = await renderWidget();

    expect(container.textContent).toContain("Stealth");
    expect(container.textContent).toContain("Arcana");
  });

  it("signs the modifier", async () => {
    mocks.skills.current = [skill({ totalModifier: -1 })];

    const container = await renderWidget();

    expect(container.textContent).toContain("-1");
  });

  it("marks a proficient skill", async () => {
    mocks.skills.current = [
      skill({ multiplier: 1 }),
      skill({ id: "arcana", name: "Arcana", multiplier: 0 }),
    ];

    const container = await renderWidget();

    expect(container.querySelectorAll('[data-proficient="true"]')).toHaveLength(
      1,
    );
  });

  it("offers a roll for each skill", async () => {
    mocks.skills.current = [skill(), skill({ id: "arcana", name: "Arcana" })];

    const container = await renderWidget();

    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("rolls the skill with its own modifier", async () => {
    mocks.skills.current = [skill({ totalModifier: 7 })];
    mocks.rollCheck.mockClear();

    const container = await renderWidget();

    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.rollCheck).toHaveBeenCalledWith({
      label: "Stealth",
      modifier: 7,
      target: "ABILITY_CHECK",
    });
  });
});
