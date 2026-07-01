import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIo = vi.fn();
const mockUseQueryClient = vi.fn();
const mockUseEffect = vi.fn();
const mockUseRef = vi.fn();

vi.mock("socket.io-client", () => ({
  io: mockIo,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: mockUseQueryClient,
}));

vi.mock("react", () => ({
  useEffect: mockUseEffect,
  useRef: mockUseRef,
}));

describe("useCharacterSocket", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("connects, joins character room, and registers state listener", async () => {
    const cleanupRef: { current?: () => void } = {};
    const invalidateQueries = vi.fn();
    const socket = {
      emit: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
      connected: true,
    };

    mockUseQueryClient.mockReturnValue({ invalidateQueries });
    mockUseRef.mockReturnValue({ current: null });
    mockIo.mockReturnValue(socket);
    mockUseEffect.mockImplementation((effect: () => void | (() => void)) => {
      cleanupRef.current = effect() as () => void;
    });

    const { useCharacterSocket } = await import("../useCharacterSocket");
    const { dispatch } = useCharacterSocket("char_1");

    expect(mockIo).toHaveBeenCalledWith("http://localhost:3000");
    expect(socket.emit).toHaveBeenCalledWith("join_character", "char_1");
    expect(socket.on).toHaveBeenCalledWith("state_updated", expect.any(Function));

    const onStateUpdated = socket.on.mock.calls[0][1] as (actionType: string) => void;
    onStateUpdated("MODIFY_HP");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["character"] });

    dispatch({ type: "MODIFY_HP", characterId: "char_1", payload: { amount: -3 } } as any);
    expect(socket.emit).toHaveBeenCalledWith("dispatch_action", expect.any(Object));

    cleanupRef.current?.();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("skips socket connection when characterId is undefined", async () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseRef.mockReturnValue({ current: null });
    mockUseEffect.mockImplementation((effect: () => void | (() => void)) => {
      effect();
    });

    const { useCharacterSocket } = await import("../useCharacterSocket");
    useCharacterSocket(undefined);

    expect(mockIo).not.toHaveBeenCalled();
  });

  it("logs error and does not emit when dispatching while disconnected", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const socket = {
      emit: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
    };

    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseRef.mockReturnValue({ current: null });
    mockIo.mockReturnValue(socket);
    mockUseEffect.mockImplementation((effect: () => void | (() => void)) => {
      effect();
    });

    const { useCharacterSocket } = await import("../useCharacterSocket");
    const { dispatch } = useCharacterSocket("char_2");
    dispatch({ type: "MODIFY_HP", characterId: "char_2", payload: { amount: 1 } } as any);

    expect(socket.emit).not.toHaveBeenCalledWith("dispatch_action", expect.anything());
    expect(consoleError).toHaveBeenCalledWith(
      "Socket disconnected, cannot dispatch action.",
    );
    consoleError.mockRestore();
  });
});
