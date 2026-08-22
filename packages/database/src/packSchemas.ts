import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CorePackManifestSchema,
  CorePackSegmentSchema,
} from "@project/shared";

/**
 * Where the generated schemas live, resolved from this file rather than from
 * process.cwd() so the script and the test agree wherever they are run from.
 */
export const SCHEMA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/schemas",
);

export const SCHEMA_FILES = {
  segment: "segment.schema.json",
  manifest: "manifest.schema.json",
} as const;

/**
 * `io: "input"` because pack files are authored before defaults are applied,
 * so the input type is what an author actually writes. `target: "draft-7"`
 * because that is the dialect vscode-json-languageservice supports fully, and
 * editor completion for pack authors is a main reason these files exist.
 */
const OPTIONS = { io: "input", target: "draft-7" } as const;

export const buildPackSchemas = (): {
  segment: object;
  manifest: object;
} => ({
  segment: z.toJSONSchema(CorePackSegmentSchema, OPTIONS),
  manifest: z.toJSONSchema(CorePackManifestSchema, OPTIONS),
});

/** Exactly the bytes the generator writes, so the no-diff test can compare. */
export const serialiseSchema = (schema: object): string =>
  `${JSON.stringify(schema, null, 2)}\n`;
