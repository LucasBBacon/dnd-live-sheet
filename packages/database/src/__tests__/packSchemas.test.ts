import { describe, expect, it } from "vitest";
import { buildPackSchemas } from "../packSchemas.js";

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
