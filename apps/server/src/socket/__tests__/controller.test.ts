import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeWebSockets } from "../controller.ts";

const { mockSafeParse, mockModifyCharacterHp, mockSocketEvents } = vi.hoisted(
  () => ({
  mockSafeParse: vi.fn(),
  mockModifyCharacterHp: vi.fn(),
    mockSocketEvents: {
      ROOM_JOIN: "room:join",
      HP_MODIFIED: "character:hp_modified",
    },
  }),
);

vi.mock("@project/shared", () => ({
  GameActionSchema: {
    safeParse: mockSafeParse,
  },
  SOCKET_EVENTS: mockSocketEvents,
}));

vi.mock("../../services/combatService.js", () => ({
  modifyCharacterHp: mockModifyCharacterHp,
}));

describe("socket controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createSocketHarness = () => {
    const eventHandlers = new Map<string, (...args: any[]) => any>();
    const socket = {
      id: "socket_1",
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        eventHandlers.set(event, handler);
      }),
      join: vi.fn(),
      emit: vi.fn(),
    };

    const roomEmitter = { emit: vi.fn() };
    const io = {
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        if (event === "connection") handler(socket as any);
      }),
      to: vi.fn(() => roomEmitter),
    };

    return { io, socket, eventHandlers, roomEmitter };
  };

  it("registers connection and join handlers", () => {
    const { io, socket, eventHandlers } = createSocketHarness();
    initializeWebSockets(io as any);

    expect(io.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("join_character", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("room:join", expect.any(Function));

    const joinHandler = eventHandlers.get("join_character");
    joinHandler?.("char_123");
    expect(socket.join).toHaveBeenCalledWith("char_char_123");
    expect(socket.join).toHaveBeenCalledWith("campaign_char_123");
  });

  it("handles shared ROOM_JOIN alias", () => {
    const { io, socket, eventHandlers } = createSocketHarness();
    initializeWebSockets(io as any);

    const joinHandler = eventHandlers.get("room:join");
    joinHandler?.("campaign_55");
    expect(socket.join).toHaveBeenCalledWith("char_campaign_55");
    expect(socket.join).toHaveBeenCalledWith("campaign_campaign_55");
  });

  it("emits action_error when payload validation fails", async () => {
    const { io, socket, eventHandlers } = createSocketHarness();
    initializeWebSockets(io as any);

    mockSafeParse.mockReturnValue({ success: false });

    const handler = eventHandlers.get("dispatch_action");
    await handler?.({ invalid: true });

    expect(socket.emit).toHaveBeenCalledWith("action_error", {
      message: "Malformed action payload.",
    });
    expect(mockModifyCharacterHp).not.toHaveBeenCalled();
  });

  it("handles MODIFY_HP and broadcasts state_updated", async () => {
    const { io, eventHandlers, roomEmitter } = createSocketHarness();
    initializeWebSockets(io as any);

    mockSafeParse.mockReturnValue({
      success: true,
      data: {
        type: "MODIFY_HP",
        characterId: "char_9",
        payload: { amount: -7 },
      },
    });
    mockModifyCharacterHp.mockResolvedValue({ current: 5, temporary: 0, max: 12 });

    const handler = eventHandlers.get("dispatch_action");
    await handler?.({ any: "payload" });

    expect(mockModifyCharacterHp).toHaveBeenCalledWith("char_9", -7);
    expect(io.to).toHaveBeenCalledWith("char_char_9");
    expect(roomEmitter.emit).toHaveBeenCalledWith("state_updated", "MODIFY_HP");
  });

  it("emits server failure when action processing throws", async () => {
    const { io, socket, eventHandlers } = createSocketHarness();
    initializeWebSockets(io as any);

    mockSafeParse.mockReturnValue({
      success: true,
      data: {
        type: "MODIFY_HP",
        characterId: "char_5",
        payload: { amount: -1 },
      },
    });
    mockModifyCharacterHp.mockRejectedValue(new Error("db offline"));

    const handler = eventHandlers.get("dispatch_action");
    await handler?.({ any: "payload" });

    expect(socket.emit).toHaveBeenCalledWith("action_error", {
      message: "Server failed to process action",
    });
  });

  it("handles shared HP_MODIFIED event", async () => {
    const { io, eventHandlers, roomEmitter } = createSocketHarness();
    initializeWebSockets(io as any);

    mockModifyCharacterHp.mockResolvedValue({ current: 8, temporary: 0, max: 12 });

    const handler = eventHandlers.get("character:hp_modified");
    await handler?.({
      characterId: "char_1",
      delta: -4,
      source: "test",
      timestamp: Date.now(),
    });

    expect(mockModifyCharacterHp).toHaveBeenCalledWith("char_1", -4);
    expect(io.to).toHaveBeenCalledWith("char_char_1");
    expect(roomEmitter.emit).toHaveBeenCalledWith("state_updated", "MODIFY_HP");
  });
});
