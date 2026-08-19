import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import { characters } from "@project/database/src/schema/operational.js";
import { renderSql } from "./fakeDb.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * The two relay handlers. Both persist-or-relay and then broadcast to the
 * room *excluding* the sender, on the assumption the sender already applied
 * the change optimistically.
 */
describe("socket gateway - HP_MODIFIED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const hpPayload = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    delta: -5,
    source: "Fireball",
    timestamp: 1_700_000_000_000,
    ...overrides,
  });

  it("persists the delta as one atomic expression, not a read-modify-write", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, hpPayload());

    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);

    // The comment in socket.ts claims this prevents a lost update when two
    // sources damage the same character in the same millisecond. That is only
    // true if the new value is computed in SQL rather than in JS.
    expect(renderSql(updates[0]?.set?.["currentHp"])).toEqual({
      sql: '"characters"."current_hp" + $1',
      params: [-5],
    });

    // No SELECT of the current hp - that would reintroduce the race.
    expect(harness.db.opsFor(characters, "select")).toHaveLength(1);
  });

  it("broadcasts to the campaign room excluding the sender", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    expect(harness.socket.to).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.roomEmits).toEqual([
      {
        room: "campaign_camp-1",
        event: SOCKET_EVENTS.HP_MODIFIED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);

    // io.to would echo back to the sender, who already applied it optimistically.
    expect(harness.ioEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([]);
  });

  it("rolls back to the sender when the socket has no campaign context", async () => {
    harness = await setupGateway();
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.HP_MODIFIED, payload },
      },
    ]);
    expect(harness.db.opsFor(characters, "update")).toEqual([]);
    expect(harness.roomEmits).toEqual([]);
  });

  it("rolls back and does not broadcast when the character is in another campaign", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow({ campaignId: "camp-other" })]);
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.HP_MODIFIED, payload },
      },
    ]);
    expect(harness.db.opsFor(characters, "update")).toEqual([]);
    expect(harness.roomEmits).toEqual([]);
  });

  it("rolls back rather than broadcasting when the write fails", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.failOn(characters, "update", new Error("connection lost"));
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    // The whole point of the rollback: peers must not be told about a change
    // that never landed.
    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.HP_MODIFIED, payload },
      },
    ]);
    expect(harness.consoleError).toHaveBeenCalledWith(
      "Failed to process HP modification:",
      expect.any(Error),
    );
  });

  it("carries healing through with the sign preserved", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);

    await harness.emit(
      SOCKET_EVENTS.HP_MODIFIED,
      hpPayload({ delta: 8, source: "Potion of Healing" }),
    );

    const [update] = harness.db.opsFor(characters, "update");
    expect(renderSql(update?.set?.["currentHp"]).params).toEqual([8]);
  });
});

describe("socket gateway - ROLL_RESULTS", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const rollPayload = {
    characterId: "char-1",
    rollResults: [{ total: 17, rolls: [12], modifier: 5, target: null }],
  };

  it("relays to the room without writing anything", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);

    await harness.emit(SOCKET_EVENTS.ROLL_RESULTS, rollPayload);

    expect(harness.roomEmits).toEqual([
      {
        room: "campaign_camp-1",
        event: SOCKET_EVENTS.ROLL_RESULTS,
        payload: { actorId: harness.socket.id, data: rollPayload },
      },
    ]);

    // Rolls are ephemeral - the only db read is the campaign ownership check.
    expect(harness.db.ops.every((op) => op.kind === "select")).toBe(true);
  });

  it("rolls back to the sender when the character is not in the campaign", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, []);

    await harness.emit(SOCKET_EVENTS.ROLL_RESULTS, rollPayload);

    expect(harness.roomEmits).toEqual([]);
    expect(harness.senderEmits).toEqual([
      {
        event: "error:rollback",
        payload: { event: SOCKET_EVENTS.ROLL_RESULTS, payload: rollPayload },
      },
    ]);
  });
});
