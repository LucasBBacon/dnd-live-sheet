import { readFileSync } from "node:fs";
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

  // the manifest is the pack's identity block plus assembly metadata; only the
  // identity half may reach the pack, whose meta schema is strict
  const { segments, ...packMeta } = readSegment("manifest.json") as {
    segments: string[];
  };

  const merged = segments.reduce<Record<string, unknown[]>>(
    (accumulator, segmentPath) => {
      const segment = readSegment(segmentPath);

      for (const key of [
        "traits",
        "races",
        "classes",
        "subclasses",
        "resources",
        "equipment",
        "feats",
        "backgrounds",
        "spells",
      ]) {
        const entries = segment[key];
        if (Array.isArray(entries)) {
          accumulator[key] = [...(accumulator[key] ?? []), ...entries];
        }
      }

      return accumulator;
    },
    {},
  );

  cached = toRuleSnapshot(
    CoreRulePackSchema.parse({ pack: packMeta, ...merged }),
  );
  return cached;
};
