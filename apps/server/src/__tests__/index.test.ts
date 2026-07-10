import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAppUse = vi.fn();
const mockExpressFactory = vi.fn(() => ({
  use: mockAppUse,
}));
const mockExpressJson = vi.fn(() => "json_middleware");

const mockCreateServer = vi.fn();
const mockListen = vi.fn();

const mockCreateAuthMiddleware = vi.fn(() => "auth_middleware");
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

vi.mock("../routes/homebrew.js", () => ({
  default: "homebrew_routes",
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

vi.mock("../gateway/socket.js", () => ({
  initializeWebSocketGateway: mockInitializeWebSocketGateway,
}));

describe("server bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PORT;
    delete process.env.CLIENT_URL;

    mockCreateServer.mockReturnValue({
      listen: mockListen,
    });
  });

  it("wires middleware, routes, gateway sockets, and starts server", async () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    await import("../index");

    expect(mockCreateServer).toHaveBeenCalled();
    expect(mockCreateAuthMiddleware).toHaveBeenCalled();
    expect(mockInitializeWebSocketGateway).toHaveBeenCalledWith(
      expect.objectContaining({ listen: mockListen }),
    );

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
    expect(mockAppUse).toHaveBeenNthCalledWith(
      6,
      "/api/homebrew",
      "auth_middleware",
      "homebrew_routes",
    );
    expect(mockAppUse).toHaveBeenNthCalledWith(7, "global_error_handler");

    expect(mockListen).toHaveBeenCalledWith(3000, expect.any(Function));
  });
});
