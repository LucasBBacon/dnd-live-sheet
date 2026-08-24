import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import {
  buildPackSchemas,
  serialiseSchema,
  SCHEMA_DIR,
  SCHEMA_FILES,
} from "../packSchemas.js";

describe("buildPackSchemas", () => {
  const { segment, manifest } = buildPackSchemas();

  it("emits draft-07, which is what editors support fully", () => {
    expect((segment as { $schema: string }).$schema).toBe(
      "http://json-schema.org/draft-07/schema#",
    );
  });

  it("makes every content section optional on a segment", () => {
    expect((segment as { required?: string[] }).required ?? []).toEqual([]);
  });

  it("covers every content section", () => {
    expect(
      Object.keys((segment as { properties: object }).properties).sort(),
    ).toEqual(
      [
        "$schema",
        "backgrounds",
        "classes",
        "equipment",
        "feats",
        "proficiencies",
        "races",
        "resources",
        "spells",
        "subclasses",
        "traits",
      ].sort(),
    );
  });

  it("requires the manifest to name its segments", () => {
    expect((manifest as { required: string[] }).required).toContain("segments");
  });
});

const PACK_DIR = path.resolve(SCHEMA_DIR, "../packs/core_2014_pack");

const readPackJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(path.join(PACK_DIR, relativePath), "utf8"));

const manifestFile = readPackJson("manifest.json") as { segments: string[] };

describe("the authored pack validates against its own schemas", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const { segment, manifest } = buildPackSchemas();
  const validateSegment = ajv.compile(segment);
  const validateManifest = ajv.compile(manifest);

  it("validates the manifest", () => {
    const valid = validateManifest(manifestFile);
    // surface the actual failures rather than a bare false
    expect(validateManifest.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it.each(manifestFile.segments)("validates %s", (relativePath) => {
    const valid = validateSegment(readPackJson(relativePath));
    // surface the actual failures rather than a bare false
    expect(validateSegment.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe("the generated schemas are up to date", () => {
  it.each(Object.entries(SCHEMA_FILES))(
    "%s matches what the generator emits",
    (key, filename) => {
      const onDisk = readFileSync(path.join(SCHEMA_DIR, filename), "utf8");
      const regenerated = serialiseSchema(
        buildPackSchemas()[key as "segment" | "manifest"],
      );
      // if this fails, run: pnpm --filter @project/database schemas:generate
      expect(onDisk).toBe(regenerated);
    },
  );
});

describe("data/schemas holds nothing hand-written", () => {
  it("contains only the generated files", () => {
    expect(readdirSync(SCHEMA_DIR).sort()).toEqual(
      Object.values(SCHEMA_FILES).sort(),
    );
  });
});
