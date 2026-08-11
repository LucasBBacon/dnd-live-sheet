import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { ActionGrant, ActorInstance } from "@project/shared";
import { CombatWidget } from "../CombatWidget";

const mocks = vi.hoisted(() => ({
  consumeItem: vi.fn(),
  executeActorAction: vi.fn(),
  executeCharacterAction: vi.fn(),
  recordRollResult: vi.fn(),
  requestRoll: vi.fn(),
  selectActorInstance: vi.fn(),
}));

vi.mock("../../../hooks/useCombat", () => ({
  useCombat: () => ({
    attacks: [
      {
        weaponId: "item_weapon_longsword",
        name: "Longsword",
        attackBonus: 5,
        damageBonus: 3,
        damageExpression: "1d8 +3 slashing",
        criticalDamageExpression: "2d8 +3 slashing",
        isProficient: true,
        context: {
          hand: "main_hand",
          attackUsage: "standard",
          isTwoHandedGrip: false,
        },
        breakdown: {
          governingStat: "STR",
          attack: ["STR (+3)", "Proficiency (+2)"],
          damage: ["STR (+3)"],
        },
        slot: "main_hand",
        activation: "action",
        actionId: "action_weapon_item_weapon_longsword",
        requiresAmmo: false,
        currentAmmo: 0,
        ammoInventoryId: null,
      },
    ],
  }),
}));

vi.mock("../../../store/rollStore", () => ({
  useRollStore: (selector: (state: { requestRoll: typeof mocks.requestRoll }) => unknown) =>
    selector({ requestRoll: mocks.requestRoll }),
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
  inventory: [
    {
      id: "inv_shield",
      itemId: "item_armor_shield",
      quantity: 1,
      slot: "off_hand",
      isAttuned: false,
    },
  ],
  latestRollResults: [],
  recordRollResult: mocks.recordRollResult,
  ruleSnapshot: null,
  runtimeEffects: {
    getActiveActors: () => [actor],
  },
  selectedActorInstanceId: actor.instanceId,
  selectActorInstance: mocks.selectActorInstance,
  traitGrants: [
    {
      id: "grant_protection",
      traitId: "trait_fs_protection",
      source: "test",
    },
  ],
  traits: [],
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
};

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

describe("CombatWidget", () => {
  it("renders the Protection helper and records a manual enemy attack result", async () => {
    mocks.requestRoll.mockResolvedValueOnce(11);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    expect(container.textContent).toContain("Reaction helper");
    expect(container.textContent).toContain("Fighting Style: Protection");
    expect(container.textContent).toContain("Shield equipped");

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Use Protection",
    );

    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.requestRoll).toHaveBeenCalledWith(
      "1d20",
      "Enter the enemy attack total after applying Protection disadvantage.",
      {
        mode: "manual_total",
        targetLabel: "Enemy attack total",
        allowDigitalRoll: false,
        manualPlaceholder: "Attack total...",
        submitLabel: "Record",
      },
    );
    expect(mocks.recordRollResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rollResults: [
          expect.objectContaining({
            total: 11,
            target: "ATTACK_ROLL",
            label: "Fighting Style: Protection",
            summary: "Manual disadvantaged enemy attack total",
          }),
        ],
      }),
    );

    root.unmount();
    container.remove();
  });

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

  it("executes a weapon action through the character action path", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "STRIKE",
    );

    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.consumeItem).not.toHaveBeenCalled();
    expect(mocks.executeCharacterAction).toHaveBeenCalledWith(
      "action_weapon_item_weapon_longsword",
    );

    root.unmount();
    container.remove();
  });
});
