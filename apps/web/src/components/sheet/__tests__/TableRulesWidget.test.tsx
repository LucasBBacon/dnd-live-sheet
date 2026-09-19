import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { TraitDefinition } from "@project/shared";
import { TableRulesWidget } from "../TableRulesWidget";
import { packRuleSnapshot } from "../../../store/__tests__/packFixture";

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
  currentHp: { current: 10 },
  resources: { current: [] as Array<{ id: string; current: number }> },
  executeCharacterAction: vi.fn(),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeStates: mocks.activeStates.current,
      activeConditions: [],
      getActiveTraits: () => mocks.traits.current,
      getSuspendedConditions: () => mocks.suspended.current,
      currentHp: mocks.currentHp.current,
      resources: mocks.resources.current,
      executeCharacterAction: mocks.executeCharacterAction,
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

describe("TableRulesWidget and Relentless Rage", () => {
  const relentless = () => {
    const trait = packRuleSnapshot().traitsById?.["trait_relentless_rage"];
    if (!trait) throw new Error("trait_relentless_rage missing from the shipped pack");
    return trait;
  };

  const makeTheSave = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Make the save",
    );

  it("reports the save and its current DC whenever the trait is granted", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = [];
    mocks.currentHp.current = 10;
    mocks.resources.current = [{ id: "resource_relentless_rage", current: 1 }];

    const container = await renderWidget();

    expect(container.textContent).toContain("Reporter");
    expect(container.textContent).toContain("DC 15 Constitution saving throw");
    expect(makeTheSave(container)).toBeUndefined();
  });

  it("offers the save at 0 hit points while raging", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = ["status_raging"];
    mocks.currentHp.current = 0;
    mocks.resources.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("DC 10 Constitution saving throw");
    expect(makeTheSave(container)).toBeDefined();
  });

  it("asks the server to resolve the save when pressed", async () => {
    mocks.traits.current = [relentless()];
    mocks.activeStates.current = ["status_raging"];
    mocks.currentHp.current = 0;
    mocks.resources.current = [];
    mocks.executeCharacterAction.mockClear();

    const container = await renderWidget();
    await act(async () => {
      makeTheSave(container)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.executeCharacterAction).toHaveBeenCalledWith("action_relentless_rage");
  });
});
