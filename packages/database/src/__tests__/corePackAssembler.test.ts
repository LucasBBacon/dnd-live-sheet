import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CoreRulePackSchema } from "@project/shared";
import {
  MERGED_SECTIONS,
  assembleCoreRulePack,
  assembleCoreRulePackSync,
} from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

describe("assembleCoreRulePack", () => {
  it("merges every segment the manifest lists", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    expect(pack.pack.packId).toBe("core_2014");
    expect(pack.classes).toHaveLength(12);
    expect(pack.races).toHaveLength(9);
    expect(pack.traits.length).toBeGreaterThan(400);
  });

  it("keeps assembly metadata out of the strict identity block", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);

    expect(pack.pack).not.toHaveProperty("segments");
  });

  it("names the file when a listed segment is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pack-"));
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        packId: "core_2014",
        version: 1,
        ruleset: "dnd_5e_2014",
        publishedAt: "2026-08-13T00:00:00.000Z",
        segments: ["classes/absent.json"],
      }),
    );

    await expect(assembleCoreRulePack(dir)).rejects.toThrow(
      /classes[/\\]absent\.json/,
    );
  });

  it("rejects a manifest with no segment list", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pack-"));
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        packId: "core_2014",
        version: 1,
        ruleset: "dnd_5e_2014",
        publishedAt: "2026-08-13T00:00:00.000Z",
      }),
    );

    await expect(assembleCoreRulePack(dir)).rejects.toThrow(/segments/);
  });
});

/**
 * The engine and web suites read the shipped pack too, and each carried its
 * own hand-copied assembler until 2026-08-24. Both had already drifted: both
 * omitted the proficiencies section, and both validated with a bare
 * CoreRulePackSchema.parse rather than through parseCoreRulePack, so neither
 * ran semantic validation. Adding one key to manifest.json broke both, weeks
 * apart, and each time the suite reported *fewer* tests rather than failures.
 *
 * They now call this module. The sync reader exists because those fixtures
 * are consumed synchronously in 75 places; the merge itself is shared, so the
 * two readers cannot drift the way the three assemblers did.
 */
describe("one assembler, two readers", () => {
  it("merges the same pack synchronously as asynchronously", async () => {
    const [asyncPack, syncPack] = [
      await assembleCoreRulePack(SHIPPED_PACK),
      assembleCoreRulePackSync(SHIPPED_PACK),
    ];

    expect(syncPack).toEqual(asyncPack);
  });

  it("names the file when a listed segment is missing, synchronously too", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pack-sync-"));
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        packId: "core_2014",
        version: 1,
        ruleset: "dnd_2014",
        publishedAt: "2026-01-01T00:00:00Z",
        segments: ["missing/segment.json"],
      }),
    );

    expect(() => assembleCoreRulePackSync(dir)).toThrow(/pack segment/);
  });

  /**
   * The drift itself, pinned. A section added to CoreRulePackSchema and not
   * to MERGED_SECTIONS is silently dropped from every assembled pack - which
   * is exactly what happened to proficiencies in the two copies.
   */
  it("merges every array section the pack schema declares", () => {
    const declared = Object.keys(CoreRulePackSchema.shape).filter(
      (key) => key !== "pack",
    );

    expect([...MERGED_SECTIONS].sort()).toEqual(declared.sort());
  });
});
