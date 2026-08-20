import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { ActiveEffect } from "@project/engine";
import type { ActionGrant } from "@project/shared";
import { ActiveEffectsWidget } from "../ActiveEffectsWidget";

const mocks = vi.hoisted(() => ({
  effects: { current: [] as unknown[] },
  actions: { current: [] as unknown[] },
  executeCharacterAction: vi.fn(),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (
    selector: (state: {
      runtimeEffects: { getActiveEffects: () => unknown[] } | null;
      getCharacterActions: () => unknown[];
      executeCharacterAction: typeof mocks.executeCharacterAction;
    }) => unknown,
  ) =>
    selector({
      runtimeEffects: { getActiveEffects: () => mocks.effects.current },
      getCharacterActions: () => mocks.actions.current,
      executeCharacterAction: mocks.executeCharacterAction,
    }),
}));

const effect = (overrides: Partial<ActiveEffect> = {}): ActiveEffect =>
  ({
    instanceId: "effect_1",
    sourceName: "Rage",
    durationType: "manual",
    isSelfConcentration: false,
    modifiers: [],
    grantedStates: ["status_raging"],
    ...overrides,
  }) as ActiveEffect;

const ender = (effectTag: string, id: string, name: string): ActionGrant => ({
  id,
  name,
  activation: "special",
  effect: { type: "remove_effect", effectTag },
});

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ActiveEffectsWidget />);
  });

  return container;
};

const dismissButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button"));

describe("ActiveEffectsWidget", () => {
  it("names each effect by its source", async () => {
    mocks.effects.current = [effect()];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("Rage");
  });

  it("says so when nothing is affecting the character", async () => {
    mocks.effects.current = [];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("Nothing active");
  });

  it("leaves out permanent trait states, which are not effects", async () => {
    mocks.effects.current = [
      effect({
        instanceId: "trait_state_trait_powerful_build",
        sourceName: "Powerful Build",
        kind: "trait_state",
      }),
    ];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Powerful Build");
  });

  it("leaves out summons, which have their own panel", async () => {
    mocks.effects.current = [
      effect({ sourceName: "Clockwork Toy", kind: "summon" }),
    ];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Clockwork Toy");
  });

  it.each([
    ["turn_end", "until the end of your turn"],
    ["turn_start", "until the start of your next turn"],
    ["rest_short", "until a short rest"],
    ["rest_long", "until a long rest"],
    ["manual", "until removed"],
  ])("reads %s as %s", async (durationType, label) => {
    mocks.effects.current = [
      effect({ durationType: durationType as ActiveEffect["durationType"] }),
    ];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain(label);
  });

  it("counts down a rounds-based effect", async () => {
    mocks.effects.current = [
      effect({ durationType: "rounds", durationRemaining: 3 }),
    ];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain("3 rounds");
  });

  it("offers no way to dismiss an effect nothing can end", async () => {
    mocks.effects.current = [effect({ effectTag: "dash" })];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(dismissButtons(container)).toHaveLength(0);
  });

  it("offers a dismissal when an authored action can end it", async () => {
    mocks.effects.current = [effect({ effectTag: "rage" })];
    mocks.actions.current = [ender("rage", "action_end_rage", "End Rage")];

    const container = await renderWidget();

    expect(dismissButtons(container)).toHaveLength(1);
    expect(dismissButtons(container)[0]?.textContent).toContain("End Rage");
  });

  it("runs the ending action when dismissed", async () => {
    mocks.effects.current = [effect({ effectTag: "hidden" })];
    mocks.actions.current = [
      ender("hidden", "action_end_hiding", "Stop Hiding"),
    ];
    mocks.executeCharacterAction.mockClear();

    const container = await renderWidget();

    await act(async () => {
      dismissButtons(container)[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(mocks.executeCharacterAction).toHaveBeenCalledWith(
      "action_end_hiding",
    );
  });

  it("does not offer one action as the ender for a different effect", async () => {
    mocks.effects.current = [effect({ effectTag: "dodge" })];
    mocks.actions.current = [ender("rage", "action_end_rage", "End Rage")];

    const container = await renderWidget();

    expect(dismissButtons(container)).toHaveLength(0);
  });

  it("lists what an effect grants, so a bare state is not a mystery", async () => {
    mocks.effects.current = [
      effect({ grantedStates: ["status_attacks_against_have_disadvantage"] }),
    ];
    mocks.actions.current = [];

    const container = await renderWidget();

    expect(container.textContent).toContain(
      "status_attacks_against_have_disadvantage",
    );
  });
});
