import { describe, expect, it } from "vitest";
import { MockAuthProvider } from "../MockAuthProvider";
import type { Request } from "express";

describe("MockAuthProvider", () => {
  const createMockRequest = (headers: Record<string, string> = {}): Request =>
    ({
      headers,
    } as unknown as Request);

  describe("authenticate", () => {
    it("returns authenticated user when x-tester-id header present", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user123" });

      const result = await provider.authenticate(req);

      expect(result).toEqual({ id: "user123" });
    });

    it("returns user with correct id from header", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "testuser456" });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("testuser456");
    });

    it("returns null when x-tester-id header missing", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({});

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });

    it("returns null when x-tester-id is not a string", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers["x-tester-id"] = 123 as any;

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });

    it("returns null when x-tester-id is array", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers["x-tester-id"] = ["user1", "user2"] as any;

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });

    it("returns null when x-tester-id is object", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers["x-tester-id"] = { id: "user" } as any;

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });

    it("returns null when x-tester-id is undefined", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers["x-tester-id"] = undefined as any;

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });
  });

  describe("header case sensitivity", () => {
    it("treats header name as case-insensitive (lowercase)", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user789" });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("user789");
    });

    it("handles header value with special characters", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user-123_abc" });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("user-123_abc");
    });

    it("handles header value with numbers", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "12345" });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("12345");
    });

    it("handles whitespace in header value", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user 123" });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("user 123");
    });

    it("handles empty string header value", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "" });

      const result = await provider.authenticate(req);

      // Empty string is still a string, so should return user with empty id
      expect(result).toEqual({ id: "" });
    });
  });

  describe("multiple instances", () => {
    it("multiple provider instances work independently", async () => {
      const provider1 = new MockAuthProvider();
      const provider2 = new MockAuthProvider();
      const req1 = createMockRequest({ "x-tester-id": "user1" });
      const req2 = createMockRequest({ "x-tester-id": "user2" });

      const result1 = await provider1.authenticate(req1);
      const result2 = await provider2.authenticate(req2);

      expect(result1?.id).toBe("user1");
      expect(result2?.id).toBe("user2");
    });

    it("provider instances do not share state", async () => {
      const provider1 = new MockAuthProvider();
      const provider2 = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "testuser" });

      const result1 = await provider1.authenticate(req);
      const result2 = await provider2.authenticate(req);

      expect(result1).toEqual(result2);
    });
  });

  describe("authentication flow", () => {
    it("implements AuthProvider interface", () => {
      const provider = new MockAuthProvider();

      expect(provider).toHaveProperty("authenticate");
      expect(typeof provider.authenticate).toBe("function");
    });

    it("authenticate returns async result", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user123" });

      const result = provider.authenticate(req);

      expect(result).toBeInstanceOf(Promise);
      const resolved = await result;
      expect(resolved).toEqual({ id: "user123" });
    });

    it("authenticate always completes successfully", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();

      const result = await provider.authenticate(req);

      // Should not throw, even on auth failure
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles request with many other headers", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({
        "x-tester-id": "user123",
        authorization: "Bearer token",
        "content-type": "application/json",
        "user-agent": "test-agent",
      });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("user123");
    });

    it("prioritizes x-tester-id over other auth headers", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers["x-tester-id"] = "tester123";
      req.headers["authorization"] = "Bearer actual-token";

      const result = await provider.authenticate(req);

      expect(result?.id).toBe("tester123");
    });

    it("handles request with no headers object", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest();
      req.headers = {};

      const result = await provider.authenticate(req);

      expect(result).toBeNull();
    });

    it("handles UUID format user ids", async () => {
      const provider = new MockAuthProvider();
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const req = createMockRequest({ "x-tester-id": uuid });

      const result = await provider.authenticate(req);

      expect(result?.id).toBe(uuid);
    });

    it("returns exact authenticated user structure", async () => {
      const provider = new MockAuthProvider();
      const req = createMockRequest({ "x-tester-id": "user123" });

      const result = await provider.authenticate(req);

      expect(result).toEqual({ id: "user123" });
      expect(Object.keys(result || {})).toEqual(["id"]);
    });
  });

  describe("sequential calls", () => {
    it("handles multiple sequential authentications", async () => {
      const provider = new MockAuthProvider();

      const req1 = createMockRequest({ "x-tester-id": "user1" });
      const req2 = createMockRequest({ "x-tester-id": "user2" });
      const req3 = createMockRequest({ "x-tester-id": "user3" });

      const result1 = await provider.authenticate(req1);
      const result2 = await provider.authenticate(req2);
      const result3 = await provider.authenticate(req3);

      expect(result1?.id).toBe("user1");
      expect(result2?.id).toBe("user2");
      expect(result3?.id).toBe("user3");
    });

    it("handles mixed success and failure authentication", async () => {
      const provider = new MockAuthProvider();

      const success = await provider.authenticate(
        createMockRequest({ "x-tester-id": "user1" }),
      );
      const failure = await provider.authenticate(createMockRequest({}));
      const success2 = await provider.authenticate(
        createMockRequest({ "x-tester-id": "user2" }),
      );

      expect(success?.id).toBe("user1");
      expect(failure).toBeNull();
      expect(success2?.id).toBe("user2");
    });
  });

  describe("concurrent calls", () => {
    it("handles concurrent authentication requests", async () => {
      const provider = new MockAuthProvider();

      const promises = [
        provider.authenticate(createMockRequest({ "x-tester-id": "user1" })),
        provider.authenticate(createMockRequest({ "x-tester-id": "user2" })),
        provider.authenticate(createMockRequest({ "x-tester-id": "user3" })),
      ];

      const results = await Promise.all(promises);

      expect(results[0]?.id).toBe("user1");
      expect(results[1]?.id).toBe("user2");
      expect(results[2]?.id).toBe("user3");
    });
  });
});
