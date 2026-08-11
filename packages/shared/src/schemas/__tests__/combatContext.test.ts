import { describe, expect, it } from "vitest";
import {
  CombatContextSchema,
  CombatEventSchema,
  CombatTurnOwnerSchema,
} from "../combatContext.js";

describe("CombatTurnOwnerSchema", () => {
  it("requires actorInstanceId for actor turn owners", () => {
    expect(() =>
      CombatTurnOwnerSchema.parse({ kind: "actor", label: "Wolf" }),
    ).toThrow(/actorInstanceId/i);
  });

  it("accepts player and external owners without actor ids", () => {
    expect(CombatTurnOwnerSchema.parse({ kind: "player" })).toEqual({
      kind: "player",
    });
    expect(
      CombatTurnOwnerSchema.parse({ kind: "external", label: "Goblin" }),
    ).toEqual({ kind: "external", label: "Goblin" });
  });
});

describe("CombatEventSchema", () => {
  it("accepts hostile attack events with partial roll knowledge", () => {
    const event = CombatEventSchema.parse({
      id: "evt_1",
      type: "hostile_attack_declared",
      relationship: "adjacent_ally",
      rollSnapshot: {
        id: "roll_1",
        kind: "attack",
        knowledge: "manual_total",
        total: 17,
      },
    });

    expect(event.status).toBe("pending");
    expect(event.rollSnapshot?.knowledge).toBe("manual_total");
    expect(event.openedAtRound).toBeNull();
  });
});

describe("CombatContextSchema", () => {
  it("builds a default player-owned combat context", () => {
    const parsed = CombatContextSchema.parse({});

    expect(parsed).toEqual({
      inCombat: false,
      roundNumber: null,
      activeTurnOwner: null,
      economy: {
        actionAvailable: true,
        bonusActionAvailable: true,
        reactionAvailable: true,
      },
      turnFlags: {},
      pendingEvents: [],
      recentEvents: [],
    });
  });
});
