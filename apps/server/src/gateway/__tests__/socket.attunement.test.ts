import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import {
  characterInventory,
  characters,
} from "@project/database/src/schema/operational.js";
import { renderSql } from "./fakeDb.js";
import {
  characterRow,
  inventoryRow,
  joinCampaign,
  setupGateway,
  type GatewayHarness,
} from "./socketHarness.js";

const ROOM = "campaign_camp-1";

/**
 * `ITEM_ATTUNED` was declared in `SOCKET_EVENTS` and bound by nobody for the
 * whole life of the gateway, while the client emitted it from two live call
 * sites. Attunement was applied optimistically, never written, and silently
 * lost on the next rehydrate - which also dropped every modifier gated on it.
 *
 * These tests cover the handler that closes that hole. The cap and the
 * equipped-only rule are enforced here rather than trusted from the payload,
 * because `syncRemoteAttunement` on the client already assumes a server that
 * refuses an illegal fourth attunement.
 */
describe("socket gateway - ITEM_ATTUNED", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  const attunePayload = (overrides: Record<string, unknown> = {}) => ({
    characterId: "char-1",
    inventoryId: "inv-1",
    isAttuned: true,
    timestamp: 1,
    ...overrides,
  });

  const readyToAttune = async (
    rows: Record<string, unknown>[] = [
      inventoryRow({ id: "inv-1", slot: "ring_1" }),
    ],
  ) => {
    harness = await setupGateway();
    await joinCampaign(harness);
    harness.db.seed(characters, [characterRow()]);
    harness.db.seed(characterInventory, rows);
  };

  it("writes the attunement inside a transaction", async () => {
    await readyToAttune();

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toEqual({ isAttuned: true });
    // The read and the write have to share a transaction, or two sockets
    // attuning at once both read two and both commit a third.
    expect(updates[0]?.inTransaction).toBe(true);
  });

  it("scopes the write to the acting character", async () => {
    await readyToAttune();

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    // Without the character_id predicate a guessed inventory id would attune
    // an item belonging to somebody else at the table.
    const [update] = harness.db.opsFor(characterInventory, "update");
    expect(renderSql(update?.where).sql).toContain(
      '"character_inventory"."character_id"',
    );
  });

  it("broadcasts the change to the room excluding the sender", async () => {
    await readyToAttune();
    const payload = attunePayload();

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, payload);

    expect(harness.roomEmits).toEqual([
      {
        room: ROOM,
        event: SOCKET_EVENTS.ITEM_ATTUNED,
        payload: { actorId: harness.socket.id, data: payload },
      },
    ]);
    // The sender applied it optimistically, so echoing it back would be a
    // redundant round trip - and io.to(room) would include them.
    expect(harness.senderEmits).toEqual([]);
    expect(harness.ioEmits).toEqual([]);
  });

  it("refuses to attune an item that is only carried", async () => {
    await readyToAttune([inventoryRow({ id: "inv-1", slot: "backpack" })]);

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("action_error");
  });

  it("refuses a fourth attunement", async () => {
    await readyToAttune([
      inventoryRow({ id: "inv-1", slot: "ring_1", isAttuned: false }),
      inventoryRow({ id: "inv-2", slot: "ring_2", isAttuned: true }),
      inventoryRow({ id: "inv-3", slot: "amulet", isAttuned: true }),
      inventoryRow({ id: "inv-4", slot: "cloak", isAttuned: true }),
    ]);

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("action_error");
  });

  it("breaks an attunement even when the character is at the cap", async () => {
    await readyToAttune([
      inventoryRow({ id: "inv-1", slot: "ring_1", isAttuned: true }),
      inventoryRow({ id: "inv-2", slot: "ring_2", isAttuned: true }),
      inventoryRow({ id: "inv-3", slot: "amulet", isAttuned: true }),
    ]);

    await harness.emit(
      SOCKET_EVENTS.ITEM_ATTUNED,
      attunePayload({ isAttuned: false }),
    );

    // Applying the cap to a release would strand a character at three
    // attunements with no way back down.
    const updates = harness.db.opsFor(characterInventory, "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toEqual({ isAttuned: false });
  });

  it("does not count the target item against the cap when it is already attuned", async () => {
    await readyToAttune([
      inventoryRow({ id: "inv-1", slot: "ring_1", isAttuned: true }),
      inventoryRow({ id: "inv-2", slot: "ring_2", isAttuned: true }),
      inventoryRow({ id: "inv-3", slot: "amulet", isAttuned: true }),
    ]);

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    // A redundant re-attune is a no-op, not a cap breach: counting the target
    // against itself would reject a state the character is already in.
    expect(harness.db.opsFor(characterInventory, "update")).toHaveLength(1);
    expect(harness.senderEmits).toEqual([]);
  });

  it("reports a missing inventory row to the sender", async () => {
    await readyToAttune([inventoryRow({ id: "inv-9", slot: "ring_1" })]);

    await harness.emit(SOCKET_EVENTS.ITEM_ATTUNED, attunePayload());

    expect(harness.db.opsFor(characterInventory, "update")).toEqual([]);
    expect(harness.senderEmits[0]?.event).toBe("action_error");
    expect(harness.roomEmits).toEqual([]);
  });
});
