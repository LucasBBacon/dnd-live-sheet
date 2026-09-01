import { describe, expect, it } from "vitest";
import {
  isServerBroadcastPayload,
  unwrapServerBroadcastPayload,
  type ActionExecutedPayload,
  type ActionIntentPayload,
  type ActionResolvedPayload,
  type HpModifiedPayload,
} from "../transport/socket.js";

describe("socket broadcast payload helpers", () => {
  const hpPayload: HpModifiedPayload = {
    characterId: "char_42",
    delta: -5,
    source: "unit_test",
    timestamp: 12345,
  };

  it("identifies wrapped payloads", () => {
    const wrapped = {
      actorId: "socket_1",
      data: hpPayload,
    };

    expect(isServerBroadcastPayload(wrapped)).toBe(true);
  });

  it("does not identify raw payloads as wrapped", () => {
    expect(isServerBroadcastPayload(hpPayload)).toBe(false);
  });

  it("unwraps wrapped payloads", () => {
    const wrapped = {
      actorId: "socket_1",
      data: hpPayload,
    };

    expect(unwrapServerBroadcastPayload(wrapped)).toEqual(hpPayload);
  });

  it("returns raw payloads unchanged", () => {
    expect(unwrapServerBroadcastPayload(hpPayload)).toEqual(hpPayload);
  });

  it("unwraps actor action execution payloads", () => {
    const actionPayload: ActionExecutedPayload = {
      characterId: "char_42",
      actionId: "action_tinker_construct",
      source: "character",
      timestamp: 23456,
    };

    const wrapped = {
      actorId: "socket_2",
      data: actionPayload,
    };

    expect(isServerBroadcastPayload(wrapped)).toBe(true);
    expect(unwrapServerBroadcastPayload(wrapped)).toEqual(actionPayload);
  });
});

describe("item action transport", () => {
  it("types an item intent with the instance it was pressed on", () => {
    const intent: ActionIntentPayload = {
      characterId: "char-1",
      requestId: "req-1",
      actionId: "action_acid_vial_throw",
      source: "item",
      instanceId: "inv-42",
      timestamp: 0,
    };

    expect(intent.source).toBe("item");
    expect(intent.instanceId).toBe("inv-42");
  });

  it("carries notes back on the resolved payload", () => {
    const resolved: Pick<ActionResolvedPayload, "notes"> = {
      notes: ["The target takes 1d4 fire damage at the start of its turns."],
    };

    expect(resolved.notes).toHaveLength(1);
  });
});
