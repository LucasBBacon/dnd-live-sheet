import { describe, expect, it } from "vitest";
import {
  isServerBroadcastPayload,
  unwrapServerBroadcastPayload,
  type HpModifiedPayload,
} from "../socket.js";

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
});
