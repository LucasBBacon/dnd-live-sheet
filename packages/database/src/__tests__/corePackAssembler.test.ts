import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

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
