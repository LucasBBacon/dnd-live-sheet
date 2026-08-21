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

/**
 * The schema graph is stubbed, not exercised.
 *
 * These tests are about the lazy proxy: when the connection is built, what
 * happens without DATABASE_URL, and what gets handed to drizzle. None of that
 * depends on the schema's *content* - the second test only asks that drizzle
 * received an object.
 *
 * Importing it cost 3.3s a run. Not transform: `vi.resetModules()` and the
 * dynamic import below force the real modules to be *evaluated* every time,
 * which means constructing ~40 drizzle tables and, through operational.js, the
 * whole of @project/shared's zod schemas. That put the first test within a CPU
 * spike of the 5s default, so it went red whenever the suite ran in parallel
 * and green whenever it was run alone. Stubbing them takes it to ~150ms.
 *
 * The real tables are covered by operational-schema.test.ts and reference's
 * own tests, and every other test in this package imports them for real.
 */
vi.mock("../schema/operational.js", () => ({ stubbedOperationalTable: {} }));
vi.mock("../schema/reference.js", () => ({ stubbedReferenceTable: {} }));

describe("database client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it("throws on first db access when DATABASE_URL is missing", async () => {
    const mod = await import("../client.js");

    expect(() => (mod.db as unknown as Record<string, unknown>).select).toThrow(
      "DATABASE_URL is missing",
    );
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

    const mod = await import("../client.js");

    expect(mockConfig).toHaveBeenCalledWith({ path: "../../.env" });
    expect(mockPostgres).not.toHaveBeenCalled();
    expect(mockDrizzle).not.toHaveBeenCalled();

    expect(
      () => (mod.db as unknown as Record<string, unknown>).select,
    ).not.toThrow();
    expect(mockPostgres).toHaveBeenCalledWith(
      "postgresql://user:pass@localhost:5432/test_db",
    );
    expect(mockDrizzle).toHaveBeenCalledWith(
      postgresClient,
      expect.objectContaining({
        schema: expect.any(Object),
      }),
    );
  });
});
