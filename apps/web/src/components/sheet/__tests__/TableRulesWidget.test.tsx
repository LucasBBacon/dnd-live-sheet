import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { TraitDefinition } from "@project/shared";
import { TableRulesWidget } from "../TableRulesWidget";

const wolf: TraitDefinition = {
  id: "trait_totem_spirit_wolf",
  name: "Totem Spirit: Wolf",
  modifiers: { fixed: [], choices: [] },
  tableNotes: [
    {
      text: "While raging, your friends have advantage on melee attack rolls.",
      requiredStates: ["status_raging"],
      forbiddenStates: [],
    },
  ],
  resources: [],
  triggers: [],
  diceRules: [],
  criticalHitModifiers: [],
  actions: [],
};

const mocks = vi.hoisted(() => ({
  activeStates: { current: [] as string[] },
  traits: { current: [] as unknown[] },
  suspended: { current: [] as Array<{ condition: string; source: string }> },
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeStates: mocks.activeStates.current,
      activeConditions: [],
      getActiveTraits: () => mocks.traits.current,
      getSuspendedConditions: () => mocks.suspended.current,
      ruleSnapshot: null,
      classLevels: {},
      traitGrants: [],
    }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TableRulesWidget />);
  });

  return container;
};

describe("TableRulesWidget", () => {
  it("says nothing is active when no line applies", async () => {
    mocks.traits.current = [wolf];
    mocks.activeStates.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("Nothing to report");
    expect(container.textContent).not.toContain("your friends have advantage");
  });

  it("shows a note with its source once the gating state is active", async () => {
    mocks.traits.current = [wolf];
    mocks.activeStates.current = ["status_raging"];

    const container = await renderWidget();

    expect(container.textContent).toContain("Totem Spirit: Wolf");
    expect(container.textContent).toContain("your friends have advantage");
  });
});

describe("TableRulesWidget and suspended conditions", () => {
  it("says which condition is suspended, and by what", async () => {
    mocks.traits.current = [];
    mocks.activeStates.current = [];
    mocks.suspended.current = [{ condition: "frightened", source: "Mindless Rage" }];

    const container = await renderWidget();

    expect(container.textContent).toContain("Suspended");
    expect(container.textContent).toContain("Mindless Rage");
    expect(container.textContent).toContain("Frightened is suspended.");

    mocks.suspended.current = [];
  });
});
