import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * The two relay handlers. HP_MODIFIED persists through modifyCharacterHp, so
 * the stored value is clamped to the derived maximum, and then broadcasts the
 * total it settled on to the whole room *including* the sender - whose own
 * maximum may be stale (#89).
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

  it("clamps a heal to the derived maximum instead of storing what the client asked for", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow({ currentHp: 31 })]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, hpPayload({ delta: 10 }));

    // max_hp holds base rolled hit points (24); the derived maximum for this
    // fixture is 33, so 31 + 10 stores 33 rather than 41 (#89)
    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set?.["currentHp"]).toBe(33);
  });

  it("clamps damage at zero instead of storing a negative total", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow({ currentHp: 5 })]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, hpPayload({ delta: -30 }));

    const updates = harness.db.opsFor(characters, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set?.["currentHp"]).toBe(0);
  });

  it("broadcasts the settled total to the whole room, including the sender", async () => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterClasses, [
      { classId: "class_fighter", classLevel: 3 },
    ]);
    const payload = hpPayload();

    await harness.emit(SOCKET_EVENTS.HP_MODIFIED, payload);

    // 20 - 5 = 15, against a derived maximum of 33
    expect(harness.ioEmits).toEqual([
      {
        room: "campaign_camp-1",
        event: SOCKET_EVENTS.HP_MODIFIED,
        payload: {
          actorId: harness.socket.id,
          data: { ...payload, currentHp: 15, maxHp: 33 },
        },
      },
    ]);
    // the sender is included now: it may have clamped against a stale
    // maximum, and the asserted total is what corrects it (#89)
    expect(harness.roomEmits).toEqual([]);
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

    // currentHp 20 + 8 = 28, clamped to the derived maximum with no ledger
    // row seeded (27)
    const [update] = harness.db.opsFor(characters, "update");
    expect(update?.set?.["currentHp"]).toBe(27);
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
