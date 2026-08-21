import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  campaignMembers,
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import {
  characterRow,
  inventoryRow,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

/**
 * ROOM_JOIN is the only handler that authenticates, so campaignAccess is left
 * real here - a stubbed membership check would test nothing worth testing.
 */
describe("socket gateway - ROOM_JOIN", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const asMember = (db: GatewayHarness["db"]) => {
    db.seed(campaignMembers, [{ role: "player" }]);
  };

  it("rejects a socket with no auth user context without touching the db", async () => {
    harness = await setupGateway({ userId: null });

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-1" });

    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.ROOM_JOIN,
          error: "Missing socket auth user context.",
          payload: { campaignId: "camp-1" },
        },
      },
    ]);
    expect(harness.socket.join).not.toHaveBeenCalled();
    expect(harness.db.ops).toEqual([]);
  });

  it("accepts the x-tester-id header when handshake auth is absent", async () => {
    harness = await setupGateway({ userId: null, testerId: "tester-9" });
    asMember(harness.db);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-1" });

    expect(harness.socket.join).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.socket.data["userId"]).toBe("tester-9");
  });

  it("refuses to join a campaign the user is not a member of", async () => {
    harness = await setupGateway();
    harness.db.seed(campaignMembers, []);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-1" });

    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.ROOM_JOIN,
          error: "Not authorized for campaign room.",
          payload: { campaignId: "camp-1" },
        },
      },
    ]);
    expect(harness.socket.join).not.toHaveBeenCalled();
    expect(harness.socket.data["campaignId"]).toBeUndefined();
  });

  it("joins the campaign room and records the socket context", async () => {
    harness = await setupGateway();
    asMember(harness.db);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-1" });

    expect(harness.socket.join).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.socket.data).toEqual({
      campaignId: "camp-1",
      userId: "user-1",
    });
    // No character requested, so no snapshot is pushed.
    expect(harness.senderEmits).toEqual([]);
  });

  it("accepts a bare campaign id string as the payload", async () => {
    harness = await setupGateway();
    asMember(harness.db);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, "camp-1");

    expect(harness.socket.join).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.socket.data["campaignId"]).toBe("camp-1");
  });

  it("pushes an inventory snapshot to the joining client only", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, [
      inventoryRow({ id: "inv-1", slot: "main_hand" }),
      inventoryRow({ id: "inv-2", itemId: "item_armor_shield", slot: "off_hand" }),
    ]);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    expect(harness.senderEmits).toHaveLength(1);
    const [snapshot] = harness.senderEmits;
    expect(snapshot?.event).toBe(SOCKET_EVENTS.INVENTORY_SYNC);
    expect(snapshot?.payload).toEqual({
      characterId: "char-1",
      inventory: [
        inventoryRow({ id: "inv-1", slot: "main_hand" }),
        inventoryRow({
          id: "inv-2",
          itemId: "item_armor_shield",
          slot: "off_hand",
        }),
      ],
    });

    // A snapshot is for the joiner alone; broadcasting it would be a leak.
    expect(harness.roomEmits).toEqual([]);
    expect(harness.ioEmits).toEqual([]);
  });

  it("joins the room before resolving the character, not after", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, []);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    // ensureCharacterInSocketCampaign reads socket.data.campaignId, so the
    // join and context assignment have to have happened already.
    expect(harness.socket.join).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.db.opsFor(characters, "select")).toHaveLength(1);
  });

  /**
   * A rejected async listener is invisible: socket.io never observes the
   * promise, so before this the client got no snapshot and no error at all.
   * The same message covers a character in another campaign and one that does
   * not exist - which of the two it was is not the client's business.
   */
  it.each([
    ["belongs to another campaign", [characterRow({ campaignId: "camp-other" })]],
    ["does not exist", []],
  ])("reports an error when the character %s", async (_case, seeded) => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, seeded as Record<string, unknown>[]);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    expect(harness.senderEmits).toEqual([
      {
        event: "action_error",
        payload: {
          event: SOCKET_EVENTS.ROOM_JOIN,
          error: "Character is not available in this campaign.",
          payload: { campaignId: "camp-1", characterId: "char-1" },
        },
      },
    ]);
    expect(harness.db.opsFor(characterInventory)).toEqual([]);
  });

  /**
   * Membership was verified before the character was looked at, so the join
   * itself is legitimate. Only the character binding failed, and tearing down
   * a valid room membership over it would drop the player out of a campaign
   * they are entitled to be in.
   */
  it("keeps the room join that already succeeded when the character fails", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow({ campaignId: "camp-other" })]);

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    expect(harness.socket.join).toHaveBeenCalledWith("campaign_camp-1");
    expect(harness.socket.data).toEqual({
      campaignId: "camp-1",
      userId: "user-1",
    });
  });

  /**
   * The character lookup is not the only await that was unguarded - the
   * inventory read can fail on its own, and did so just as silently.
   */
  it("reports an error when the inventory read fails", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow()]);
    harness.db.failOn(characterInventory, "select", new Error("connection lost"));

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
      campaignId: "camp-1",
      characterId: "char-1",
    });

    expect(harness.senderEmits[0]?.event).toBe("action_error");
  });

  it("keeps socket context isolated between two connections", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    const second = harness.connect({ socketId: "socket-b", userId: "user-2" });

    await harness.emit(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-1" });
    await second.dispatch(SOCKET_EVENTS.ROOM_JOIN, { campaignId: "camp-2" });

    expect(harness.socket.data).toEqual({
      campaignId: "camp-1",
      userId: "user-1",
    });
    expect(second.data).toEqual({ campaignId: "camp-2", userId: "user-2" });
  });
});
