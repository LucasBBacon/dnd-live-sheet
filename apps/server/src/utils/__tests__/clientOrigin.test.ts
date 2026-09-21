import { afterEach, describe, expect, it, vi } from "vitest";
import { clientOrigin } from "../clientOrigin.js";

describe("clientOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns CLIENT_URL when it is set", () => {
    vi.stubEnv("CLIENT_URL", "https://sheet.example.com");
    expect(clientOrigin()).toBe("https://sheet.example.com");
  });

  it("falls back to the Vite dev server when CLIENT_URL is unset", () => {
    vi.stubEnv("CLIENT_URL", "");
    expect(clientOrigin()).toBe("http://localhost:5173");
  });
});
