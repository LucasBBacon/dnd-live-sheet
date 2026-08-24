import { describe, expect, it } from "vitest";
import { parseImportInvocation } from "../importInvocation.js";

/**
 * `persistCoreRulePack` truncates the reference tables CASCADE, and those
 * cascades reach character data - the core-pack cutover removed 12 characters,
 * 184 character_traits, 104 inventory rows and 2 custom traits from a live
 * database. The script had no guard of any kind: it took a path off argv and
 * went.
 *
 * This is the decision the guard makes, split out so it can be exercised
 * without a database attached.
 */
describe("parseImportInvocation", () => {
  const DEFAULT_DIR = "/repo/data/packs/core_2014_pack";

  it("refuses to proceed when the confirmation flag is absent", () => {
    expect(parseImportInvocation([], DEFAULT_DIR).confirmed).toBe(false);
  });

  it("falls back to the shipped pack directory when no path is given", () => {
    expect(parseImportInvocation(["--yes"], DEFAULT_DIR)).toEqual({
      packDir: DEFAULT_DIR,
      confirmed: true,
    });
  });

  it("takes the pack directory from the first positional argument", () => {
    expect(parseImportInvocation(["/other/pack", "--yes"], DEFAULT_DIR)).toEqual(
      { packDir: "/other/pack", confirmed: true },
    );
  });

  it("accepts the confirmation flag before the pack directory", () => {
    // pnpm run puts forwarded args in an order the caller does not control, so
    // a position-sensitive parse would make the guard pass or fail by accident.
    expect(parseImportInvocation(["--yes", "/other/pack"], DEFAULT_DIR)).toEqual(
      { packDir: "/other/pack", confirmed: true },
    );
  });

  it("never treats a flag as the pack directory", () => {
    // The bug this prevents is the worst one available here: importing into
    // "--yes" as a path, or worse, silently using the default while the
    // operator believes they named a directory.
    expect(
      parseImportInvocation(["--yes", "--verbose"], DEFAULT_DIR).packDir,
    ).toBe(DEFAULT_DIR);
  });

  it("requires the whole flag, not a prefix of it", () => {
    // "--y" reading as consent would let a typo authorise a destructive run.
    expect(parseImportInvocation(["--y"], DEFAULT_DIR).confirmed).toBe(false);
    expect(parseImportInvocation(["--yes-really"], DEFAULT_DIR).confirmed).toBe(
      false,
    );
  });
});
