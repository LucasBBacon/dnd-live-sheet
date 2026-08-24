import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/src/corePackAssembler.js";
import { parseStoredPackPayload } from "../storedPackPayload.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * `core_rule_packs.payload` is jsonb declared `$type<CoreRulePack>()`, and both
 * readers - `packRulebook` and `ruleSnapshotCache` - handed it straight to
 * `toRuleSnapshot` with no parse anywhere in the path. A payload written
 * before a schema change therefore did not error: the maps it builds came out
 * short or empty, and every rules lookup quietly resolved to nothing.
 *
 * Unlike a trait row there is only one payload, so there is no "skip the bad
 * one" option - a payload that does not parse means the server has no rules,
 * and saying so is strictly better than serving an empty rulebook.
 */
describe("parseStoredPackPayload", () => {
  it("returns the pack when the stored payload still matches the schema", async () => {
    const pack = await assembleCoreRulePack(PACK_DIR);

    const parsed = parseStoredPackPayload(pack, "core_rule_packs.payload");

    expect(parsed.pack.packId).toBe(pack.pack.packId);
    expect(parsed.traits).toHaveLength(pack.traits.length);
  });

  it("throws rather than returning an empty rulebook when the payload has drifted", () => {
    expect(() =>
      parseStoredPackPayload({ pack: { packId: "core" } }, "test-source"),
    ).toThrow();
  });

  it("names the failing path so the drift can be found", () => {
    // A bare Zod message with no path is the legibility gap that made the
    // rollback-side re-parse so expensive to diagnose.
    let message = "";
    try {
      parseStoredPackPayload({ pack: { packId: "core" } }, "test-source");
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("pack");
    expect(message).toContain("test-source");
  });

  it("rejects a payload that is not an object at all", () => {
    expect(() => parseStoredPackPayload(null, "test-source")).toThrow(
      /test-source/,
    );
  });
});
