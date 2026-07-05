import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAppUse = vi.fn();
const mockExpressFactory = vi.fn(() => ({
  use: mockAppUse,
}));
const mockExpressJson = vi.fn(() => "json_middleware");

const mockCreateServer = vi.fn();
const mockListen = vi.fn();
const mockIoInstance = { on: vi.fn(), to: vi.fn() };
const mockServerCtor = vi.fn(() => mockIoInstance);

const mockCreateAuthMiddleware = vi.fn(() => "auth_middleware");
const mockInitializeWebSockets = vi.fn();
const mockInitializeWebSocketGateway = vi.fn();

vi.mock("express", () => {
  (mockExpressFactory as any).json = mockExpressJson;
  return { default: mockExpressFactory };
});

vi.mock("http", () => ({
  default: {
    createServer: mockCreateServer,
  },
}));

vi.mock("cors", () => ({
  default: vi.fn(() => "cors_middleware"),
}));

vi.mock("helmet", () => ({
  default: vi.fn(() => "helmet_middleware"),
}));

vi.mock("../routes/character.js", () => ({
  default: "character_routes",
}));

vi.mock("../routes/reference.js", () => ({
  default: "reference_routes",
}));

vi.mock("../middleware/requireAuth.js", () => ({
  createAuthMiddleware: mockCreateAuthMiddleware,
}));

vi.mock("../core/auth/MockAuthProvider.js", () => ({
  MockAuthProvider: class MockAuthProvider {},
}));

vi.mock("../middleware/errorHandler.js", () => ({
  globalErrorHandler: "global_error_handler",
}));

vi.mock("socket.io", () => ({
  Server: class Server {
    constructor(...args: any[]) {
      mockServerCtor(...args);
      return mockIoInstance as any;
    }
  },
}));

vi.mock("../socket/controller.js", () => ({
  initializeWebSockets: mockInitializeWebSockets,
}));

vi.mock("../gateway/socket.js", () => ({
  initializeWebSocketGateway: mockInitializeWebSocketGateway,
}));

describe("server bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PORT;
    delete process.env.CLIENT_URL;
    delete process.env.USE_GATEWAY_SOCKETS;

    mockCreateServer.mockReturnValue({
      listen: mockListen,
    });
  });

  it("wires middleware, routes, controller sockets, and starts server by default", async () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    await import("../index.ts");

    expect(mockCreateServer).toHaveBeenCalled();
    expect(mockServerCtor).toHaveBeenCalled();
    expect(mockCreateAuthMiddleware).toHaveBeenCalled();
    expect(mockInitializeWebSockets).toHaveBeenCalledWith(mockIoInstance);
    expect(mockInitializeWebSocketGateway).not.toHaveBeenCalled();

    expect(mockAppUse).toHaveBeenNthCalledWith(1, "helmet_middleware");
    expect(mockAppUse).toHaveBeenNthCalledWith(2, "cors_middleware");
    expect(mockAppUse).toHaveBeenNthCalledWith(3, "json_middleware");
    expect(mockAppUse).toHaveBeenNthCalledWith(
      4,
      "/api/character",
      "auth_middleware",
      "character_routes",
    );
    expect(mockAppUse).toHaveBeenNthCalledWith(
      5,
      "/api/reference",
      "reference_routes",
    );
    expect(mockAppUse).toHaveBeenNthCalledWith(6, "global_error_handler");

    expect(mockListen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("uses gateway sockets when USE_GATEWAY_SOCKETS=true", async () => {
    process.env.USE_GATEWAY_SOCKETS = "true";
    await import("../index.ts");

    expect(mockCreateServer).toHaveBeenCalled();
    expect(mockCreateAuthMiddleware).toHaveBeenCalled();
    expect(mockInitializeWebSocketGateway).toHaveBeenCalledWith(
      expect.objectContaining({ listen: mockListen }),
    );
    expect(mockInitializeWebSockets).not.toHaveBeenCalled();
    expect(mockServerCtor).not.toHaveBeenCalled();

    expect(mockListen).toHaveBeenCalledWith(3000, expect.any(Function));
  });
});
