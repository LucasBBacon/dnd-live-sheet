import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CoreRulePack } from "@project/shared";
import { CoreRulePackLoadError, parseCoreRulePack } from "./corePackLoader.js";

/**
 * The array sections a segment file may contribute.
 *
 * Mirrors CoreRulePackSchema's array fields. A section missing from a segment
 * contributes nothing, so segments stay small and focused.
 *
 * Exported so `corePackAssembler.test.ts` can hold it against the schema: a
 * section declared there and forgotten here is dropped from every assembled
 * pack in silence, which is precisely how the two hand-copied assemblers this
 * module replaced both lost `proficiencies`.
 */
export const MERGED_SECTIONS = [
  "traits",
  "resources",
  "races",
  "classes",
  "subclasses",
  "feats",
  "backgrounds",
  "equipment",
  "spells",
  "proficiencies",
] as const;

type Json = Record<string, unknown>;

const parseJson = (raw: string, filePath: string, label: string): Json => {
  try {
    return JSON.parse(raw) as Json;
  } catch (error) {
    throw new CoreRulePackLoadError(`Could not read ${label} '${filePath}'.`, {
      cause: error,
    });
  }
};

const readJson = async (filePath: string, label: string): Promise<Json> => {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CoreRulePackLoadError(`Could not read ${label} '${filePath}'.`, {
      cause: error,
    });
  }
  return parseJson(raw, filePath, label);
};

const readJsonSync = (filePath: string, label: string): Json => {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new CoreRulePackLoadError(`Could not read ${label} '${filePath}'.`, {
      cause: error,
    });
  }
  return parseJson(raw, filePath, label);
};

/**
 * The segment paths a manifest lists, validated.
 *
 * Split from the readers so both reach the same failure the same way.
 */
const segmentPathsFrom = (manifest: Json, manifestPath: string): string[] => {
  const { segments } = manifest;

  if (!Array.isArray(segments)) {
    throw new CoreRulePackLoadError(
      `Pack manifest '${manifestPath}' must list its segments under "segments".`,
    );
  }

  return segments.map(String);
};

/**
 * Merges already-read segments into one validated pack.
 *
 * The only place the section list, the assembly-key strip and the validation
 * call live. Both readers below are thin wrappers around it, so a sync and an
 * async assembly cannot disagree about what a pack contains.
 */
const buildCoreRulePack = (
  manifest: Json,
  segments: Json[],
  manifestPath: string,
): CoreRulePack => {
  // $schema is an editor pointer, not pack identity. CoreRulePackSchema.pack is
  // strict, so it is stripped here alongside the assembly-only segment list.
  const { segments: _segments, $schema: _schemaPointer, ...packMeta } = manifest;

  const merged: Record<string, unknown[]> = Object.fromEntries(
    MERGED_SECTIONS.map((section) => [section, [] as unknown[]]),
  );

  for (const segment of segments) {
    for (const section of MERGED_SECTIONS) {
      const entries = segment[section];
      if (Array.isArray(entries)) merged[section]!.push(...entries);
    }
  }

  // the manifest is the pack's identity block plus assembly metadata. only the
  // identity half may reach the pack, whose meta schema is strict
  return parseCoreRulePack({ pack: packMeta, ...merged }, manifestPath);
};

/**
 * Every segment the manifest lists, merged into one validated pack.
 *
 * The manifest drives the read rather than a directory walk: a misnamed file
 * then fails loudly instead of becoming silently missing content, and merge
 * order is the authored order rather than whatever the filesystem returns.
 * @param packDir The pack directory, containing manifest.json
 * @returns The assembled pack, schema- and semantically validated
 */
export const assembleCoreRulePack = async (
  packDir: string,
): Promise<CoreRulePack> => {
  const manifestPath = path.join(packDir, "manifest.json");
  const manifest = await readJson(manifestPath, "pack manifest");

  const segments = await Promise.all(
    segmentPathsFrom(manifest, manifestPath).map((relativePath) =>
      readJson(path.join(packDir, relativePath), "pack segment"),
    ),
  );

  return buildCoreRulePack(manifest, segments, manifestPath);
};

/**
 * `assembleCoreRulePack`, read synchronously.
 *
 * Exists for the engine and web test fixtures, which are consumed
 * synchronously in dozens of places; making them async would have meant
 * rewriting every call site to fix a duplication problem. Both readers share
 * `buildCoreRulePack`, so this is a different way in rather than a second
 * implementation.
 * @param packDir The pack directory, containing manifest.json
 * @returns The assembled pack, schema- and semantically validated
 */
export const assembleCoreRulePackSync = (packDir: string): CoreRulePack => {
  const manifestPath = path.join(packDir, "manifest.json");
  const manifest = readJsonSync(manifestPath, "pack manifest");

  const segments = segmentPathsFrom(manifest, manifestPath).map(
    (relativePath) =>
      readJsonSync(path.join(packDir, relativePath), "pack segment"),
  );

  return buildCoreRulePack(manifest, segments, manifestPath);
};
