import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { ActionGrant, ActorInstance } from "@project/shared";
import { CombatWidget } from "../CombatWidget";

const mocks = vi.hoisted(() => ({
  rollState: { current: "normal" as "advantage" | "disadvantage" | "normal" },
  attacksPerAction: {
    current: {
      total: 1,
      breakdown: [{ name: "Attack action", value: 1 }],
    } as { total: number; breakdown: Array<{ name: string; value: number | string }> },
  },
  attacks: { current: null as unknown },
  consumeItem: vi.fn(),
  executeActorAction: vi.fn(),
  executeCharacterAction: vi.fn(),
  openHostileAttackReactionWindow: vi.fn(() => "evt_1"),
  recordRollResult: vi.fn(),
  requestRoll: vi.fn(),
  resolveCombatEvent: vi.fn(),
  selectActorInstance: vi.fn(),
  spendReaction: vi.fn(() => true),
}));

vi.mock("../../../hooks/useCombat", () => ({
  useCombat: () => ({
    attacks: (mocks.attacks.current as unknown[] | null) ?? [
      {
        weaponId: "item_weapon_longsword",
        name: "Longsword",
        attackBonus: 5,
        rollState: mocks.rollState.current,
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

vi.mock("../../../hooks/useCharacterStats", () => ({
  useDerivedStats: () => ({ attacksPerAction: mocks.attacksPerAction.current }),
}));

vi.mock("../../../store/rollStore", () => ({
  useRollStore: (
    selector: (state: { requestRoll: typeof mocks.requestRoll }) => unknown,
  ) => selector({ requestRoll: mocks.requestRoll }),
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
  combatContext: {
    pendingEvents: [
      {
        id: "evt_1",
        type: "reaction_window_opened",
        status: "pending",
        relationship: "adjacent_ally",
        openedAtRound: 1,
        sourceLabel: "Hostile creature",
        targetLabel: "Nearby ally",
      },
    ],
    economy: {
      actionAvailable: true,
      bonusActionAvailable: true,
      reactionAvailable: true,
      attacksRemaining: null as number | null,
    },
    recentEvents: [],
  },
  openHostileAttackReactionWindow: mocks.openHostileAttackReactionWindow,
  recordRollResult: mocks.recordRollResult,
  resolveCombatEvent: mocks.resolveCombatEvent,
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
  spendReaction: mocks.spendReaction,
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
    expect(container.textContent).toContain("Reaction window open");

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
    expect(mocks.spendReaction).toHaveBeenCalledWith("trait_fs_protection");
    expect(mocks.resolveCombatEvent).toHaveBeenCalledWith(
      "evt_1",
      expect.objectContaining({
        status: "resolved",
        summary: "Protection applied",
        reactionSourceId: "trait_fs_protection",
      }),
    );

    root.unmount();
    container.remove();
  });

  it("opens a hostile attack reaction window through the declare action", async () => {
    mocks.requestRoll.mockResolvedValueOnce(14);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    const declareButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Declare hostile attack",
    );

    expect(declareButton).toBeDefined();

    await act(async () => {
      declareButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.requestRoll).toHaveBeenCalledWith(
      "1d20",
      "Enter the hostile attack total that is threatening an ally within 5 feet.",
      {
        mode: "manual_total",
        targetLabel: "Hostile attack total",
        allowDigitalRoll: false,
        manualPlaceholder: "Attack total...",
        submitLabel: "Open window",
      },
    );
    expect(mocks.openHostileAttackReactionWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLabel: "Hostile creature",
        targetLabel: "Nearby ally",
        relationship: "adjacent_ally",
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

describe("CombatWidget roll state", () => {
  const renderWidget = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    return container;
  };

  it("flags an attack that is rolled with advantage", async () => {
    mocks.rollState.current = "advantage";

    const container = await renderWidget();

    expect(container.textContent).toContain("ADV");
  });

  it("flags an attack that is rolled with disadvantage", async () => {
    mocks.rollState.current = "disadvantage";

    const container = await renderWidget();

    expect(container.textContent).toContain("DIS");
  });

  it("shows no roll-state flag on an ordinary attack", async () => {
    mocks.rollState.current = "normal";

    const container = await renderWidget();

    expect(container.textContent).not.toContain("ADV");
    expect(container.textContent).not.toContain("DIS");
  });
});

describe("CombatWidget attacks per action", () => {
  const renderWidget = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    return container;
  };

  it("states how many attacks the Attack action grants once it is more than one", async () => {
    mocks.attacksPerAction.current = {
      total: 2,
      breakdown: [{ name: "Extra Attack", value: 2 }],
    };

    const container = await renderWidget();

    expect(container.textContent).toContain("Attack action");
    expect(container.textContent).toContain("2 attacks");
  });

  it("names the source of the extra attacks", async () => {
    mocks.attacksPerAction.current = {
      total: 2,
      breakdown: [{ name: "Extra Attack", value: 2 }],
    };

    const container = await renderWidget();

    expect(container.textContent).toContain("Extra Attack");
  });

  it("scales the wording with the count", async () => {
    mocks.attacksPerAction.current = {
      total: 3,
      breakdown: [{ name: "Extra Attack", value: 3 }],
    };

    const container = await renderWidget();

    expect(container.textContent).toContain("3 attacks");
  });

  it("says nothing at all when the character attacks only once", async () => {
    mocks.attacksPerAction.current = {
      total: 1,
      breakdown: [{ name: "Attack action", value: 1 }],
    };

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Attack action");
  });
});

describe("CombatWidget attack allowance", () => {
  const renderWidget = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    return container;
  };

  const withAllowance = (attacksRemaining: number | null) => {
    mocks.attacksPerAction.current = {
      total: 2,
      breakdown: [{ name: "Extra Attack", value: 2 }],
    };
    storeState.combatContext.economy.attacksRemaining = attacksRemaining;
  };

  it("offers the attack count before the Attack action has been taken", async () => {
    withAllowance(null);

    const container = await renderWidget();

    expect(container.textContent).toContain("2 attacks");
  });

  it("reports how many attacks have been used once the Attack action is taken", async () => {
    withAllowance(1);

    const container = await renderWidget();

    expect(container.textContent).toContain("1 of 2 used");
  });

  it("reports a fully spent allowance", async () => {
    withAllowance(0);

    const container = await renderWidget();

    expect(container.textContent).toContain("2 of 2 used");
  });

  it("never disables the strike button, even with the allowance spent", async () => {
    withAllowance(0);

    const container = await renderWidget();

    const strike = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "STRIKE",
    );

    expect(strike?.disabled).toBe(false);
  });
});

describe("CombatWidget two-weapon fighting", () => {
  const renderWidget = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CombatWidget />);
    });

    return container;
  };

  const offHandAttack = () => {
    mocks.attacks.current = [
      {
        weaponId: "item_weapon_shortsword",
        name: "Shortsword (Off-Hand)",
        attackBonus: 3,
        rollState: "normal",
        damageBonus: 0,
        damageExpression: "1d6 piercing",
        criticalDamageExpression: "2d6 piercing",
        isProficient: true,
        context: {
          hand: "off_hand",
          attackUsage: "two_weapon_bonus",
          isTwoHandedGrip: false,
        },
        breakdown: { governingStat: "STR", attack: [], damage: [] },
        slot: "off_hand",
        activation: "bonus_action",
        actionId: "action_weapon_item_weapon_shortsword_off_hand",
        requiresAmmo: false,
        currentAmmo: 0,
        ammoInventoryId: null,
      },
    ];
  };

  it("warns that an off-hand swing needs the Attack action first", async () => {
    offHandAttack();
    storeState.combatContext.economy.attacksRemaining = null;

    const container = await renderWidget();

    expect(container.textContent).toContain("Attack action");
  });

  it("drops the warning once the Attack action has been taken", async () => {
    offHandAttack();
    storeState.combatContext.economy.attacksRemaining = 1;

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Requires");
  });

  it("never warns on a main-hand swing", async () => {
    mocks.attacks.current = null;
    storeState.combatContext.economy.attacksRemaining = null;

    const container = await renderWidget();

    expect(container.textContent).not.toContain("Requires");
  });
});
