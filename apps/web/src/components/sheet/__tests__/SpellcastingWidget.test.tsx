import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { DerivedSpellcasting } from "@project/engine";
import { SpellcastingWidget } from "../SpellcastingWidget";

const mocks = vi.hoisted(() => ({
  entries: { current: [] as DerivedSpellcasting[] },
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useSpellcasting: () => mocks.entries.current,
}));

const entry = (
  overrides: Partial<DerivedSpellcasting> = {},
): DerivedSpellcasting => ({
  classId: "class_wizard",
  ability: "INT",
  modifier: 4,
  saveDc: 15,
  attackBonus: 7,
  breakdown: "INT (+4) | Proficiency (+3)",
  ...overrides,
});

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SpellcastingWidget />);
  });

  return container;
};

describe("SpellcastingWidget", () => {
  it("shows the save DC and the attack bonus", async () => {
    mocks.entries.current = [entry()];

    const container = await renderWidget();

    expect(container.textContent).toContain("15");
    expect(container.textContent).toContain("+7");
    expect(container.textContent).toContain("Wizard");
  });

  it("shows a row per casting class rather than collapsing them", async () => {
    mocks.entries.current = [
      entry(),
      entry({
        classId: "class_cleric",
        ability: "WIS",
        modifier: 2,
        saveDc: 13,
        attackBonus: 5,
      }),
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("15");
    expect(container.textContent).toContain("13");
    expect(container.textContent).toContain("Cleric");
  });

  it("reports the pact slot level for a warlock", async () => {
    mocks.entries.current = [
      entry({ classId: "class_warlock", ability: "CHA", pactSlotLevel: 5 }),
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("pact slots cast at level 5");
  });

  it("renders nothing at all for a character that casts nothing", async () => {
    mocks.entries.current = [];

    const container = await renderWidget();

    expect(container.textContent).toBe("");
  });
});
