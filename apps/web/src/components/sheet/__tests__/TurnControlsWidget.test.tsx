import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { CombatContextSchema } from "@project/shared";
import { TurnControlsWidget } from "../TurnControlsWidget";

const mocks = vi.hoisted(() => ({
  combatContext: {
    current: undefined as unknown,
  },
  activeStates: {
    current: [] as string[],
  },
  beginTurn: vi.fn(),
  endTurn: vi.fn(),
  setSurprised: vi.fn(),
  // what the character can actually do, standard and trait actions alike --
  // the widget names a spender by looking it up here
  getCharacterActions: () => [
    { id: "action_dodge", name: "Dodge", activation: "action" },
    { id: "action_rage", name: "Rage", activation: "bonus_action" },
  ],
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: {
      combatContext: unknown;
      activeStates: string[];
      beginTurn: typeof mocks.beginTurn;
      endTurn: typeof mocks.endTurn;
      setSurprised: typeof mocks.setSurprised;
      getCharacterActions: typeof mocks.getCharacterActions;
    }) => unknown,
  ) =>
    selector({
      combatContext: mocks.combatContext.current,
      activeStates: mocks.activeStates.current,
      beginTurn: mocks.beginTurn,
      endTurn: mocks.endTurn,
      setSurprised: mocks.setSurprised,
      getCharacterActions: mocks.getCharacterActions,
    }),
}));

const context = (overrides: Record<string, unknown> = {}) =>
  CombatContextSchema.parse(overrides);

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TurnControlsWidget />);
  });

  return container;
};

const clickButton = async (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  return button;
};

describe("TurnControlsWidget", () => {
  it("offers a way to begin the turn", async () => {
    mocks.combatContext.current = context();

    const container = await renderWidget();

    expect(container.textContent).toContain("Begin turn");
  });

  it("asks the store to begin the turn when clicked", async () => {
    mocks.combatContext.current = context();
    mocks.beginTurn.mockClear();

    const container = await renderWidget();
    await clickButton(container, "Begin turn");

    expect(mocks.beginTurn).toHaveBeenCalled();
  });

  it("asks the store to end the turn when clicked", async () => {
    mocks.combatContext.current = context();
    mocks.endTurn.mockClear();

    const container = await renderWidget();
    await clickButton(container, "End turn");

    expect(mocks.endTurn).toHaveBeenCalled();
  });

  it("names each part of the action economy", async () => {
    mocks.combatContext.current = context();

    const container = await renderWidget();

    expect(container.textContent).toContain("Action");
    expect(container.textContent).toContain("Bonus");
    expect(container.textContent).toContain("Reaction");
  });

  it("shows every part as available on a fresh turn", async () => {
    mocks.combatContext.current = context();

    const container = await renderWidget();

    expect(container.querySelectorAll('[data-spent="true"]')).toHaveLength(0);
  });

  it("marks the action as spent once it has been used", async () => {
    mocks.combatContext.current = context({
      economy: {
        actionAvailable: false,
        bonusActionAvailable: true,
        reactionAvailable: true,
      },
    });

    const container = await renderWidget();

    const spent = container.querySelectorAll('[data-spent="true"]');
    expect(spent).toHaveLength(1);
    expect(spent[0]?.textContent).toContain("Action");
  });

  it("never disables the turn buttons, since the sheet tracks rather than polices", async () => {
    mocks.combatContext.current = context({
      economy: {
        actionAvailable: false,
        bonusActionAvailable: false,
        reactionAvailable: false,
      },
    });

    const container = await renderWidget();

    for (const button of container.querySelectorAll("button")) {
      expect(button.disabled).toBe(false);
    }
  });

  it("shows the round number while combat is running", async () => {
    mocks.combatContext.current = context({ inCombat: true, roundNumber: 3 });

    const container = await renderWidget();

    expect(container.textContent).toContain("Round 3");
  });

  it("shows no round number outside combat", async () => {
    mocks.combatContext.current = context();

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Round");
  });
});

describe("TurnControlsWidget spender", () => {
  it("names what spent the action, so a flag action leaves a trace", async () => {
    mocks.combatContext.current = context({
      economy: {
        actionAvailable: false,
        bonusActionAvailable: true,
        reactionAvailable: true,
        spentActionSourceId: "action_dodge",
      },
    });

    const container = await renderWidget();

    expect(container.textContent).toContain("Dodge");
  });

  it("names a trait action's spender too, not only the standard ones", async () => {
    mocks.combatContext.current = context({
      economy: {
        actionAvailable: true,
        bonusActionAvailable: false,
        reactionAvailable: true,
        spentBonusActionSourceId: "action_rage",
      },
    });

    const container = await renderWidget();

    expect(container.textContent).toContain("Rage");
  });

  it("falls back to the raw id for something it cannot name", async () => {
    mocks.combatContext.current = context({
      economy: {
        actionAvailable: false,
        bonusActionAvailable: true,
        reactionAvailable: true,
        spentActionSourceId: "action_homebrew_thing",
      },
    });

    const container = await renderWidget();

    expect(container.textContent).toContain("action_homebrew_thing");
  });

  it("says nothing extra when the part is still available", async () => {
    mocks.combatContext.current = context();

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Dodge");
  });
});

/**
 * Surprise is shown, never enforced: the turn buttons and the economy pills
 * stay exactly as live as they were. The widget only says what the rule costs.
 */
describe("TurnControlsWidget surprise", () => {
  const render = async (surprised: boolean, activeStates: string[] = []) => {
    mocks.combatContext.current = context({ inCombat: true, surprised });
    mocks.activeStates.current = activeStates;
    return renderWidget();
  };

  it("shows no banner when the character was not surprised", async () => {
    const container = await render(false, ["status_feral_instinct"]);

    // the toggle's own label always reads "Surprised", so this asserts on the
    // banner element rather than on the word appearing anywhere
    expect(container.querySelector("[data-surprise]")).toBeNull();
  });

  it("reports the lost action and reaction when surprised", async () => {
    const container = await render(true);

    expect(container.textContent).toMatch(/no action or reaction/i);
  });

  it("tells a barbarian with Feral Instinct to rage first", async () => {
    const container = await render(true, ["status_feral_instinct"]);

    expect(container.textContent).toMatch(/enter your rage/i);
  });

  it("confirms the turn is free once raging", async () => {
    const container = await render(true, [
      "status_feral_instinct",
      "status_raging",
    ]);

    expect(container.textContent).toMatch(/act normally/i);
  });

  it("leaves the turn buttons live while surprised", async () => {
    const container = await render(true);

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });
});

/**
 * Surprise has to be declared, not derived: the DM settles it by comparing
 * Stealth against passive Perception across the whole table, which a
 * single-character sheet can never work out for itself.
 */
describe("TurnControlsWidget surprise toggle", () => {
  const surpriseToggle = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]');

  it("offers a way to declare surprise", async () => {
    mocks.combatContext.current = context({ inCombat: true });
    mocks.activeStates.current = [];

    const container = await renderWidget();

    expect(surpriseToggle(container)).not.toBeNull();
    expect(container.textContent).toMatch(/surprised/i);
  });

  it("records surprise when the player ticks it", async () => {
    mocks.combatContext.current = context({ inCombat: true });
    mocks.activeStates.current = [];
    mocks.setSurprised.mockClear();

    const container = await renderWidget();

    await act(async () => {
      surpriseToggle(container)?.click();
    });

    expect(mocks.setSurprised).toHaveBeenCalledWith(true);
  });

  it("takes it back when the player unticks it", async () => {
    mocks.combatContext.current = context({ inCombat: true, surprised: true });
    mocks.activeStates.current = [];
    mocks.setSurprised.mockClear();

    const container = await renderWidget();

    await act(async () => {
      surpriseToggle(container)?.click();
    });

    expect(mocks.setSurprised).toHaveBeenCalledWith(false);
  });
});
