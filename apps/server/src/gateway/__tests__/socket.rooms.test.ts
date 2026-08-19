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
   * Characterisation, not endorsement: ROOM_JOIN has no try/catch, so a
   * character belonging to another campaign rejects the handler promise.
   * socket.io drops that rejection, meaning the client is left with no
   * inventory snapshot and no error to react to. Recorded here so the
   * behaviour is visible and any future fix has a test to update.
   */
  it("rejects - unhandled - when the character belongs to another campaign", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, [characterRow({ campaignId: "camp-other" })]);

    await expect(
      harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
        campaignId: "camp-1",
        characterId: "char-1",
      }),
    ).rejects.toThrow("Character does not belong to the joined campaign.");

    expect(harness.senderEmits).toEqual([]);
    expect(harness.db.opsFor(characterInventory)).toEqual([]);
  });

  it("rejects - unhandled - when the character does not exist", async () => {
    harness = await setupGateway();
    asMember(harness.db);
    harness.db.seed(characters, []);

    await expect(
      harness.emit(SOCKET_EVENTS.ROOM_JOIN, {
        campaignId: "camp-1",
        characterId: "missing",
      }),
    ).rejects.toThrow("Character does not belong to the joined campaign.");
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
