import path from "node:path";
import { assembleCoreRulePackSync } from "@project/database/pack";
import { packToRuleLookup, type PackRuleLookup } from "@project/engine";

/**
 * The shipped pack, for suites that drive the store's rule lookups.
 *
 * The web app has no *runtime* dependency on the database package and still
 * should not gain one - a pack reaches the client over /rules/snapshot, not by
 * being imported. `@project/database` is a devDependency, and the `/pack`
 * subpath imports only node builtins and `@project/shared`.
 *
 * This file used to reimplement both the assembler and the projection. It
 * carried the same two drifts the engine's copy did - no `proficiencies`
 * section, and no semantic validation - and broke the same way, silently
 * dropping 4 suites and 65 tests from the reported total rather than failing.
 */
const PACK_ROOT = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let cached: PackRuleLookup | undefined;

/**
 * What the server serves on /rules/snapshot, built from the shipped pack.
 * @returns The rule snapshot the store hands to the engine
 */
export const packRuleSnapshot = (): PackRuleLookup => {
  cached ??= packToRuleLookup(assembleCoreRulePackSync(PACK_ROOT));
  return cached;
};
