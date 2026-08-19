import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

const ROOM = "campaign_camp-1";

/**
 * TURN_STARTED and TURN_ENDED are deliberately thin - resolvePlayerTurn and
 * TurnLifecycle decide what a transition means and are unit tested without a
 * socket. What is only testable here is the adapter: that both inbound events
 * answer on the single TURN_RESOLVED channel, that the reply reaches the whole
 * room, and that they operate on the same runtime the action handler uses.
 */
describe("socket gateway - turn lifecycle", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const turnIntent = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    requestId: "turn-1",
    ...overrides,
  });

  const ready = async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    harness.db.seed(characterInventory, []);
  };

  const lastResolved = (h: GatewayHarness) =>
    (h.ioEmits.at(-1)?.payload as { data: Record<string, unknown> }).data;

  it("answers TURN_STARTED on the TURN_RESOLVED channel, to the whole room", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());

    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.ioEmits[0]?.room).toBe(ROOM);
    expect(harness.ioEmits[0]?.event).toBe(SOCKET_EVENTS.TURN_RESOLVED);
    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([]);
  });

  it("answers TURN_ENDED on the same channel", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_ENDED, turnIntent());

    expect(harness.ioEmits).toHaveLength(1);
    expect(harness.ioEmits[0]?.event).toBe(SOCKET_EVENTS.TURN_RESOLVED);
  });

  it("labels each transition so one channel can carry both", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());
    expect(lastResolved(harness)).toMatchObject({
      characterId: "char-1",
      requestId: "turn-1",
      transition: "started",
    });

    await harness.emit(
      SOCKET_EVENTS.TURN_ENDED,
      turnIntent({ requestId: "turn-2" }),
    );
    expect(lastResolved(harness)).toMatchObject({
      requestId: "turn-2",
      transition: "ended",
    });
  });

  it("wraps the reply the same way ACTION_RESOLVED is wrapped", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());

    expect(harness.ioEmits[0]?.payload).toMatchObject({
      actorId: harness.socket.id,
      data: expect.objectContaining({ transition: "started" }),
    });
  });

  it("returns the full runtime snapshot, not just the turn flags", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());
    const resolved = lastResolved(harness);

    // The sheet adopts this wholesale, so a missing key reads as "no change".
    for (const key of [
      "activeStates",
      "resources",
      "effects",
      "actors",
      "combatContext",
      "rollResults",
    ]) {
      expect(resolved, `missing ${key}`).toHaveProperty(key);
    }
    expect(typeof resolved["timestamp"]).toBe("number");
  });

  it("advances the same runtime the action handler uses", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.ACTION_INTENT, {
      characterId: "char-1",
      requestId: "act-1",
      actionId: "action_dodge",
      source: "character",
    });
    expect(lastResolved(harness)["activeStates"]).toContain("status_dodging");

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());

    // Dodge lasts until the start of your next turn, so beginning a turn is
    // what expires it. That only works if both handlers share one runtime -
    // whoever expires the effect has to be whoever the sheet syncs from.
    expect(lastResolved(harness)["activeStates"]).not.toContain(
      "status_dodging",
    );
  });

  it("rolls back to the sender when the socket never joined a campaign", async () => {
    harness = await setupGateway();
    const payload = turnIntent();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, payload);

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.TURN_STARTED, payload },
      },
    ]);
  });

  it("names the originating event in the rollback, not TURN_RESOLVED", async () => {
    harness = await setupGateway();
    const payload = turnIntent();

    await harness.emit(SOCKET_EVENTS.TURN_ENDED, payload);

    // The client keys its rollback on the event it sent.
    expect(harness.senderEmits[0]?.payload).toEqual({
      event: SOCKET_EVENTS.TURN_ENDED,
      payload,
    });
    expect(harness.consoleError).toHaveBeenCalledWith(
      "Failed to process turn ended:",
      expect.any(Error),
    );
  });

  it("rolls back when the character belongs to another campaign", async () => {
    await ready();
    harness.db.seed(characters, [characterRow({ campaignId: "camp-other" })]);

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());

    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("error:rollback");
  });

  it("has no replay cache - a repeated requestId resolves again", async () => {
    await ready();

    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());
    await harness.emit(SOCKET_EVENTS.TURN_STARTED, turnIntent());

    // Unlike ACTION_INTENT, turn transitions are not deduplicated. Recorded so
    // the asymmetry is a decision rather than a surprise.
    expect(harness.ioEmits).toHaveLength(2);
    expect(harness.senderEmits).toEqual([]);
  });
});
