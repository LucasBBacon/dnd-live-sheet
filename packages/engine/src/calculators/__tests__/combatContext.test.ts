import { describe, expect, it } from "vitest";
import { CombatContextManager } from "../combatContext.js";

describe("CombatContextManager", () => {
  it("refreshes the player's economy at the start of the player's turn", () => {
    const manager = new CombatContextManager();

    manager.beginCombat();
    expect(manager.spendAction("action_attack")).toBe(true);
    expect(manager.spendBonusAction("bonus_dash")).toBe(true);
    expect(manager.spendReaction("reaction_protection")).toBe(true);

    const state = manager.beginTurn({ kind: "player" });

    expect(state.inCombat).toBe(true);
    expect(state.roundNumber).toBe(2);
    expect(state.economy).toEqual({
      actionAvailable: true,
      bonusActionAvailable: true,
      reactionAvailable: true,
    });
  });

  it("clears once-per-turn flags on any turn boundary without refreshing the player's reaction on external turns", () => {
    const manager = new CombatContextManager();

    manager.beginTurn({ kind: "player" });
    manager.setTurnFlag("trait_sneak_attack");
    expect(manager.spendReaction("reaction_shield")).toBe(true);

    const state = manager.beginTurn({ kind: "external", label: "Orc" });

    expect(state.turnFlags).toEqual({});
    expect(state.economy.reactionAvailable).toBe(false);
    expect(state.economy.spentReactionSourceId).toBe("reaction_shield");
  });

  it("tracks pending hostile events and moves them to recent events when resolved", () => {
    const manager = new CombatContextManager();

    manager.pushEvent({
      id: "evt_hostile_attack",
      type: "reaction_window_opened",
      relationship: "adjacent_ally",
      rollSnapshot: {
        id: "roll_attack",
        kind: "attack",
        relationship: "unknown",
        rawRolls: [],
        knowledge: "manual_total",
        total: 16,
        hasAdvantage: false,
        hasDisadvantage: false,
      },
    });

    let state = manager.getContext();
    expect(state.pendingEvents).toHaveLength(1);
    expect(state.recentEvents).toEqual([]);

    state = manager.resolveEvent("evt_hostile_attack", {
      summary: "Protection applied",
      reactionSourceId: "trait_fs_protection",
      status: "resolved",
    });

    expect(state.pendingEvents).toEqual([]);
    expect(state.recentEvents).toHaveLength(1);
    expect(state.recentEvents[0]).toMatchObject({
      id: "evt_hostile_attack",
      status: "resolved",
      summary: "Protection applied",
      reactionSourceId: "trait_fs_protection",
    });
  });

  it("prevents double-spending the same reaction window", () => {
    const manager = new CombatContextManager();

    manager.beginTurn({ kind: "player" });

    expect(manager.spendReaction("reaction_protection")).toBe(true);
    expect(manager.spendReaction("reaction_shield")).toBe(false);
  });

  it("can refund spent economy when a later runtime cost aborts the action", () => {
    const manager = new CombatContextManager();

    manager.beginTurn({ kind: "player" });
    expect(manager.spendReaction("reaction_protection")).toBe(true);

    manager.refundReaction();

    const state = manager.getContext();
    expect(state.economy.reactionAvailable).toBe(true);
    expect(state.economy.spentReactionSourceId).toBeUndefined();
  });
});
