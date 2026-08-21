import { describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "@project/shared";
import { SHEET_ERROR_EVENTS } from "../sheetErrorEvents";

/**
 * The gateway emits `action_error` for every handler, but the sheet only
 * shows the ones named here - anything else is received and dropped. That is
 * a policy worth stating in one place, because the failure mode when an event
 * is missing from it is silence rather than a visible bug.
 */
describe("SHEET_ERROR_EVENTS", () => {
  it("surfaces a failed room join, which otherwise leaves the sheet blank", () => {
    expect(SHEET_ERROR_EVENTS).toContain(SOCKET_EVENTS.ROOM_JOIN);
  });

  it("still surfaces the inventory failures it always did", () => {
    expect(SHEET_ERROR_EVENTS).toEqual(
      expect.arrayContaining([
        SOCKET_EVENTS.ITEM_EQUIPPED,
        SOCKET_EVENTS.ITEM_CONSUMED,
        SOCKET_EVENTS.ITEM_ATTUNED,
      ]),
    );
  });

  it("names events through SOCKET_EVENTS rather than as loose strings", () => {
    const known = new Set<string>(Object.values(SOCKET_EVENTS));

    for (const event of SHEET_ERROR_EVENTS) {
      expect(known, `${event} is not a declared socket event`).toContain(event);
    }
  });
});
