import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CoreRulePack } from "@project/shared";
import { CoreRulePackLoadError, parseCoreRulePack } from "./corePackLoader.js";

/**
 * The array sections a segment file may contribute.
 *
 * Mirrors CoreRulePackSchema's array fields. A section missing from a segment
 * contributes nothing, so segments stay small and focused.
 */
const MERGED_SECTIONS = [
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

const readJson = async (
  filePath: string,
  label: string,
): Promise<Record<string, unknown>> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new CoreRulePackLoadError(`Could not read ${label} '${filePath}'.`, {
      cause: error,
    });
  }
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

  const { segments, ...packMeta } = manifest;

  if (!Array.isArray(segments)) {
    throw new CoreRulePackLoadError(
      `Pack manifest '${manifestPath}' must list its segments under "segments".`,
    );
  }

  const merged: Record<string, unknown[]> = Object.fromEntries(
    MERGED_SECTIONS.map((section) => [section, [] as unknown[]]),
  );

  for (const relativePath of segments) {
    const segment = await readJson(
      path.join(packDir, String(relativePath)),
      "pack segment",
    );

    for (const section of MERGED_SECTIONS) {
      const entries = segment[section];
      if (Array.isArray(entries)) merged[section]!.push(...entries);
    }
  }

  // the manifest is the pack's identity block plus assembly metadata. only the
  // identity half may reach the pack, whose meta schema is strict
  return parseCoreRulePack({ pack: packMeta, ...merged }, manifestPath);
};
