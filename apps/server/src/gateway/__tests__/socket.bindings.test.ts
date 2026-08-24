import { afterEach, describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import { setupGateway, type GatewayHarness } from "./socketHarness.js";

/**
 * The binding contract. These assertions exist so that renaming an event
 * constant, or dropping a `socket.on`, fails here rather than silently
 * turning a feature into a no-op that no test notices.
 */
describe("socket gateway - event bindings", () => {
  let harness: GatewayHarness;

  afterEach(() => {
    harness?.restore();
  });

  it("binds exactly the handlers the gateway is meant to expose", async () => {
    harness = await setupGateway();

    expect(harness.socket.boundEvents().sort()).toEqual(
      [
        SOCKET_EVENTS.ROOM_JOIN,
        SOCKET_EVENTS.HP_MODIFIED,
        SOCKET_EVENTS.ROLL_RESULTS,
        SOCKET_EVENTS.ACTION_INTENT,
        SOCKET_EVENTS.TURN_STARTED,
        SOCKET_EVENTS.TURN_ENDED,
        SOCKET_EVENTS.SURPRISE_DECLARED,
        SOCKET_EVENTS.ITEM_EQUIPPED,
        SOCKET_EVENTS.ITEM_ATTUNED,
        SOCKET_EVENTS.ITEM_CONSUMED,
        SOCKET_EVENTS.RESOURCE_CONSUMED,
        SOCKET_EVENTS.REST_COMPLETED,
        "disconnect",
      ].sort(),
    );
  });

  /**
   * INVENTORY_SYNC is declared in SOCKET_EVENTS but is emit-only: the gateway
   * pushes a snapshot to the joining client during ROOM_JOIN, so there is no
   * inbound direction to bind. Asserting the absence keeps a future "bind the
   * unbound events" sweep from adding a listener for a one-way event.
   *
   * ITEM_ATTUNED was listed here for the same reason and was never the same
   * case: it was a live client emit talking to nobody. It is bound now, and
   * the roster above is what pins it.
   */
  it("has no inbound listener for INVENTORY_SYNC", async () => {
    harness = await setupGateway();

    expect(harness.socket.boundEvents()).not.toContain(
      SOCKET_EVENTS.INVENTORY_SYNC,
    );
  });

  it("configures CORS from CLIENT_URL and allows only GET/POST", async () => {
    const previous = process.env["CLIENT_URL"];
    process.env["CLIENT_URL"] = "https://sheet.example";

    try {
      harness = await setupGateway();

      expect(harness.serverOptions).toEqual({
        cors: { origin: "https://sheet.example", methods: ["GET", "POST"] },
      });
    } finally {
      if (previous === undefined) {
        delete process.env["CLIENT_URL"];
      } else {
        process.env["CLIENT_URL"] = previous;
      }
    }
  });

  it("binds handlers per connection rather than once per server", async () => {
    harness = await setupGateway();
    const second = harness.connect({ socketId: "socket-second" });

    expect(second.boundEvents().sort()).toEqual(
      harness.socket.boundEvents().sort(),
    );
    expect(second.id).not.toBe(harness.socket.id);
  });

  it("does not touch the database merely by connecting", async () => {
    harness = await setupGateway();

    expect(harness.db.ops).toEqual([]);
  });
});
