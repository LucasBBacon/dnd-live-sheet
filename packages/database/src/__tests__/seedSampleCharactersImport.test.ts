import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Importing the sample seeder for its ROSTER must not need a database.
 *
 * The roster is read by invariant tests in this package and in apps/server,
 * and CI runs them with no DATABASE_URL at all. The module used to open its
 * Postgres client at import and throw when the variable was unset, so every
 * suite that imported the roster failed in CI while passing locally, where
 * .env supplies the variable.
 */
describe("seedSampleCharacters import", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Cold import of seeder and drizzle/postgres deps can exceed 5s default under full-suite load
  it("exposes the roster without a DATABASE_URL", async () => {
    // dotenv never overrides a variable that is already set, so an empty
    // value stands in for a machine with no .env
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();

    const { ROSTER } = await import("../seedSampleCharacters.js");

    expect(ROSTER).toHaveLength(13);
  }, 30_000);
});
