import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { ActionGrant, ActorInstance } from "@project/shared";
import { CombatWidget } from "../CombatWidget";

const mocks = vi.hoisted(() => ({
  consumeItem: vi.fn(),
  dispatchAuthoredEvent: vi.fn(),
  executeActorAction: vi.fn(),
  executeCharacterAction: vi.fn(),
  recordCombatRoll: vi.fn(),
  selectActorInstance: vi.fn(),
}));

vi.mock("../../../services/socketService", () => ({
  socketService: {
    emitCombatRoll: vi.fn(),
  },
}));

vi.mock("../../../hooks/useCombat", () => ({
  useCombat: () => ({
    attacks: [],
  }),
}));

const actorAction: ActionGrant = {
  id: "action_actor_clockwork_toy_scuttle",
  name: "Scuttle",
  activation: "special",
  effect: {
    type: "apply_effect",
    effectName: "Scuttle",
    durationType: "manual",
    states: ["actor_clockwork_toy_scuttling"],
    modifiers: [],
    isSelfConcentration: false,
    requiredStates: [],
    forbiddenStates: [],
  },
};

const actor: ActorInstance = {
  instanceId: "effect_actor:actor_clockwork_toy:0",
  templateId: "actor_clockwork_toy",
  displayLabel: "Clockwork Toy",
  controller: "player",
  lifecycleState: "active",
  currentStates: ["actor_clockwork_toy"],
  availableActions: [actorAction],
  sourceEffectInstanceId: "effect_actor",
};

const storeState = {
  id: "char_1",
  consumeItem: mocks.consumeItem,
  latestRollResults: [],
  dispatchAuthoredEvent: mocks.dispatchAuthoredEvent,
  runtimeEffects: {
    getActiveActors: () => [actor],
  },
  selectedActorInstanceId: actor.instanceId,
  selectActorInstance: mocks.selectActorInstance,
  executeActorAction: mocks.executeActorAction,
  getCharacterActions: () => [
    {
      id: "action_tinker_construct",
      name: "Construct Clockwork Device",
      activation: "hour",
      effect: {
        type: "summon",
        entityTemplateIds: ["actor_clockwork_toy"],
      },
    } as ActionGrant,
  ],
  executeCharacterAction: mocks.executeCharacterAction,
  recordCombatRoll: mocks.recordCombatRoll,
};

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

describe("CombatWidget", () => {
  it("renders actor and character action panels and executes actor action on click", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    expect(container.textContent).toContain("Character actions");
    expect(container.textContent).toContain("Construct Clockwork Device");
    expect(container.textContent).toContain("Active actors");
    expect(container.textContent).toContain("Clockwork Toy actions");

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Scuttle",
    );

    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.executeActorAction).toHaveBeenCalledWith(
      "action_actor_clockwork_toy_scuttle",
      "effect_actor:actor_clockwork_toy:0",
    );

    root.unmount();
    container.remove();
  });
});
