import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "../client";

describe("API Client", () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("successful requests", () => {
    it("should make GET request to correct endpoint", async () => {
      const mockData = { character: { id: "123" } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await apiClient("/character");

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/character", {
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-tester-id": "dev-user-1",
        }),
      });
      expect(result).toEqual(mockData);
    });

    it("should make POST request with body", async () => {
      const mockData = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const payload = { name: "Test" };
      const result = await apiClient("/character", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/character",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        })
      );
      expect(result).toEqual(mockData);
    });

    it("should make PATCH request", async () => {
      const mockData = { updated: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const payload = { name: "Updated" };
      const result = await apiClient("/character/flavor", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/character/flavor",
        expect.objectContaining({
          method: "PATCH",
        })
      );
      expect(result).toEqual(mockData);
    });

    it("should include mock user header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiClient("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-tester-id": "dev-user-1",
          }),
        })
      );
    });

    it("should merge custom headers with defaults", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiClient("/test", {
        headers: { "X-Custom": "value" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom": "value",
            "Content-Type": "application/json",
            "x-tester-id": "dev-user-1",
          }),
        })
      );
    });
  });

  describe("error handling", () => {
    it("should throw error for HTTP 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      });

      await expect(apiClient("/notfound")).rejects.toThrow("Not found");
    });

    it("should throw error for HTTP 500", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server error" }),
      });

      await expect(apiClient("/error")).rejects.toThrow("Server error");
    });

    it("should use status code fallback if no error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      await expect(apiClient("/forbidden")).rejects.toThrow("HTTP error!");
    });

    it("should handle non-JSON error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("Not JSON");
        },
      });

      await expect(apiClient("/error")).rejects.toThrow("HTTP error!");
    });

    it("should throw for HTTP 401 Unauthorized", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(apiClient("/protected")).rejects.toThrow("Unauthorized");
    });
  });

  describe("request options", () => {
    it("should pass through other RequestInit options", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiClient("/test", {
        method: "DELETE",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    it("should construct correct URL for different endpoints", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await apiClient("/character/reference/races");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/character/reference/races",
        expect.any(Object)
      );
    });
  });

  describe("response handling", () => {
    it("should return parsed JSON response", async () => {
      const complexData = {
        character: {
          id: "123",
          name: "Aragorn",
          level: 5,
          attributes: { str: 15, dex: 14 },
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => complexData,
      });

      const result = await apiClient("/character");

      expect(result).toEqual(complexData);
      expect(result.character.name).toBe("Aragorn");
    });

    it("should handle empty response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await apiClient("/test");

      expect(result).toEqual({});
    });
  });
});
