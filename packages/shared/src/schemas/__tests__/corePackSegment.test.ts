import { describe, expect, it } from "vitest";
import {
  CorePackManifestSchema,
  CorePackSegmentSchema,
} from "../corePackSegment.js";

describe("CorePackSegmentSchema", () => {
  it("accepts a segment carrying one section", () => {
    expect(CorePackSegmentSchema.parse({ traits: [] })).toEqual({ traits: [] });
  });

  it("accepts an empty segment", () => {
    expect(CorePackSegmentSchema.parse({})).toEqual({});
  });

  it("rejects a mistyped section name", () => {
    // the assembler merges a fixed section list, so a typo currently
    // contributes nothing and reports nothing
    expect(CorePackSegmentSchema.safeParse({ trrraits: [] }).success).toBe(
      false,
    );
  });

  it("accepts a $schema key so pack files can point at the generated schema", () => {
    const parsed = CorePackSegmentSchema.parse({
      $schema: "../../schemas/segment.schema.json",
      traits: [],
    });
    expect(parsed.$schema).toBe("../../schemas/segment.schema.json");
  });

  it("does not carry the pack envelope", () => {
    expect(
      CorePackSegmentSchema.safeParse({ pack: { packId: "core_2014" } }).success,
    ).toBe(false);
  });
});

describe("CorePackManifestSchema", () => {
  const manifest = {
    packId: "core_2014",
    version: 1,
    ruleset: "dnd_5e_2014",
    publishedAt: "2026-08-13T00:00:00.000Z",
    extends: [],
    owns: ["traits"],
    segments: ["traits/ported.json"],
  };

  it("accepts the real manifest shape", () => {
    expect(CorePackManifestSchema.parse(manifest).segments).toEqual([
      "traits/ported.json",
    ]);
  });

  it("requires segments", () => {
    const { segments: _omitted, ...withoutSegments } = manifest;
    expect(CorePackManifestSchema.safeParse(withoutSegments).success).toBe(
      false,
    );
  });

  it("accepts a $schema key", () => {
    expect(
      CorePackManifestSchema.parse({
        ...manifest,
        $schema: "../schemas/manifest.schema.json",
      }).$schema,
    ).toBe("../schemas/manifest.schema.json");
  });
});
