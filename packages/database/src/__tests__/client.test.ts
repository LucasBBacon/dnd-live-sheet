import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.fn();
const mockPostgres = vi.fn();
const mockDrizzle = vi.fn();

vi.mock("dotenv", () => ({
  config: mockConfig,
}));

vi.mock("postgres", () => ({
  default: mockPostgres,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mockDrizzle,
}));

describe("database client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it("throws when DATABASE_URL is missing", async () => {
    await expect(import("../client")).rejects.toThrow("DATABASE_URL is missing");
    expect(mockConfig).toHaveBeenCalledWith({ path: "../../.env" });
    expect(mockPostgres).not.toHaveBeenCalled();
    expect(mockDrizzle).not.toHaveBeenCalled();
  });

  it("initializes postgres and drizzle with schema when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test_db";

    const postgresClient = { end: vi.fn() };
    const drizzleDb = { select: vi.fn(), insert: vi.fn() };
    mockPostgres.mockReturnValue(postgresClient);
    mockDrizzle.mockReturnValue(drizzleDb);

    const mod = await import("../client");

    expect(mockConfig).toHaveBeenCalledWith({ path: "../../.env" });
    expect(mockPostgres).toHaveBeenCalledWith(
      "postgresql://user:pass@localhost:5432/test_db",
    );
    expect(mockDrizzle).toHaveBeenCalledWith(
      postgresClient,
      expect.objectContaining({
        schema: expect.any(Object),
      }),
    );
    expect(mod.db).toBe(drizzleDb);
  });
});
