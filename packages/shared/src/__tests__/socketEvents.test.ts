import { describe, expect, it } from "vitest";
import { SOCKET_EVENTS } from "../index.js";

describe("SOCKET_EVENTS turn lifecycle", () => {
  // These strings are the contract between the sheet and the server. Nothing
  // validates them at runtime, so a typo on one side fails silently.
  it("names the turn start event", () => {
    expect(SOCKET_EVENTS.TURN_STARTED).toBe("character:turn_started");
  });

  it("names the turn end event", () => {
    expect(SOCKET_EVENTS.TURN_ENDED).toBe("character:turn_ended");
  });

  it("names the event carrying a resolved turn back to the sheet", () => {
    expect(SOCKET_EVENTS.TURN_RESOLVED).toBe("character:turn_resolved");
  });

  it("keeps every event under the character namespace", () => {
    for (const [name, value] of Object.entries(SOCKET_EVENTS)) {
      if (name === "ROOM_JOIN") continue;
      expect(value, name).toMatch(/^character:/);
    }
  });
});
