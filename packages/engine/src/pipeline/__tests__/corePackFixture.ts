import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  CoreRulePackSchema,
  toRuleSnapshot,
  type CoreRulePackSnapshot,
} from "@project/shared";

/**
 * The shipped core rule pack, loaded once for the engine's suites.
 *
 * The engine has no runtime dependency on the database package and should not
 * gain one - a pack reaches production by being handed in, not by being
 * imported. Tests are the exception: they need the real authored content,
 * because these suites are the only place the engine and the rulebook meet,
 * and a hand-written stub would drift out of agreement with what ships.
 *
 * Hence the relative read rather than a package import. It is deliberate, and
 * confined to this file.
 */
const PACK_ROOT = path.join(
  process.cwd(),
  "../database/data/packs/core_2014_pack",
);

const readSegment = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(PACK_ROOT, relativePath), "utf8"));

const segmentPaths = (): string[] =>
  ["races", "classes"].flatMap((directory) =>
    readdirSync(path.join(PACK_ROOT, directory)).map(
      (file) => `${directory}/${file}`,
    ),
  );

let cached: CoreRulePackSnapshot | undefined;

/**
 * Every pack segment merged and validated, keyed for the engine's resolvers.
 *
 * Validated through CoreRulePackSchema rather than cast: a fixture that
 * accepted malformed content would let a broken pack pass the very suites
 * meant to catch it.
 * @returns Traits, races and classes from the shipped pack
 */
export const corePackSnapshot = (): CoreRulePackSnapshot => {
  if (cached) return cached;

  const manifest = readSegment("manifest.json");
  const merged = segmentPaths().reduce<{
    traits: unknown[];
    races: unknown[];
    classes: unknown[];
    subclasses: unknown[];
  }>(
    (accumulator, segmentPath) => {
      const segment = readSegment(segmentPath);

      for (const key of ["traits", "races", "classes", "subclasses"] as const) {
        const entries = segment[key];
        if (Array.isArray(entries)) accumulator[key].push(...entries);
      }

      return accumulator;
    },
    { traits: [], races: [], classes: [], subclasses: [] },
  );

  // the manifest is the pack's identity block, not part of its content
  cached = toRuleSnapshot(
    CoreRulePackSchema.parse({ pack: manifest, ...merged }),
  );
  return cached;
};
