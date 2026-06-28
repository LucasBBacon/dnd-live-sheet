import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAuthMiddleware } from "../requireAuth";
import type { AuthProvider, AuthenticatedUser } from "../core/auth/AuthInterface";
import type { Request, Response, NextFunction } from "express";

describe("createAuthMiddleware", () => {
  let mockNext: any;
  let mockRes: any;

  beforeEach(() => {
    mockNext = vi.fn() as unknown as NextFunction;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnValue(undefined),
    } as unknown as Response;
  });

  const createMockRequest = (overrides = {}): Request =>
    ({
      headers: {},
      user: undefined,
      ...overrides,
    } as unknown as Request);

  const createMockAuthProvider = (
    behavior: "authenticated" | "unauthenticated" | "error",
  ): AuthProvider => ({
    authenticate: vi.fn().mockImplementation(async (req: Request) => {
      if (behavior === "error") {
        throw new Error("Auth provider error");
      }
      if (behavior === "authenticated") {
        return { id: "user123" };
      }
      return null;
    }),
  });

  describe("successful authentication", () => {
    it("calls next() when user authenticates successfully", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toEqual({ id: "user123" });
    });

    it("attaches user object to request", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe("user123");
    });

    it("calls authenticate on the provider with request object", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(provider.authenticate).toHaveBeenCalledWith(req);
    });

    it("does not send response when authentication succeeds", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe("failed authentication", () => {
    it("returns 401 when authenticate returns null", async () => {
      const provider = createMockAuthProvider("unauthenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Unauthorized request",
      });
    });

    it("does not call next when authentication fails", async () => {
      const provider = createMockAuthProvider("unauthenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("does not attach user when authentication fails", async () => {
      const provider = createMockAuthProvider("unauthenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(req.user).toBeUndefined();
    });

    it("returns correct error message on failed authentication", async () => {
      const provider = createMockAuthProvider("unauthenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Unauthorized request",
      });
    });
  });

  describe("authentication errors", () => {
    it("returns 500 when auth provider throws error", async () => {
      const provider = createMockAuthProvider("error");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal Server Error",
      });
    });

    it("does not call next when auth provider throws error", async () => {
      const provider = createMockAuthProvider("error");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("does not attach user when auth provider throws error", async () => {
      const provider = createMockAuthProvider("error");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(req.user).toBeUndefined();
    });

    it("returns correct error message on provider error", async () => {
      const provider = createMockAuthProvider("error");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal Server Error",
      });
    });
  });

  describe("edge cases", () => {
    it("handles multiple sequential requests", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);

      const req1 = createMockRequest();
      const req2 = createMockRequest();

      await middleware(req1, mockRes as any, mockNext);
      await middleware(req2, mockRes as any, mockNext);

      expect(req1.user?.id).toBe("user123");
      expect(req2.user?.id).toBe("user123");
    });

    it("handles request with existing headers", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest({
        headers: {
          authorization: "Bearer token123",
        },
      });

      await middleware(req, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user?.id).toBe("user123");
    });

    it("preserves request properties while attaching user", async () => {
      const provider = createMockAuthProvider("authenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest({
        method: "GET",
        path: "/api/characters",
      });

      await middleware(req, mockRes as any, mockNext);

      expect((req as any).method).toBe("GET");
      expect((req as any).path).toBe("/api/characters");
      expect(req.user?.id).toBe("user123");
    });

    it("returns status 401 response object for chaining", async () => {
      const provider = createMockAuthProvider("unauthenticated");
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      // Verify status returns this for chaining
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe("authenticated user structure", () => {
    it("preserves authenticated user object structure", async () => {
      const provider = {
        authenticate: vi.fn().mockResolvedValue({ id: "testuser" }),
      } as AuthProvider;
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(req.user).toEqual({ id: "testuser" });
      expect(Object.keys(req.user || {})).toContain("id");
    });

    it("handles user with only id property", async () => {
      const provider = {
        authenticate: vi.fn().mockResolvedValue({ id: "user456" }),
      } as AuthProvider;
      const middleware = createAuthMiddleware(provider);
      const req = createMockRequest();

      await middleware(req, mockRes as any, mockNext);

      expect(req.user?.id).toBe("user456");
    });
  });
});
