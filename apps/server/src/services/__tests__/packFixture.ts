import path from "node:path";
import { assembleCoreRulePack } from "@project/database/src/corePackAssembler.js";
import { toRuleSnapshot } from "@project/shared";
import { setPackRulebookForTests } from "../packRulebook.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * Primes the module-level rulebook from the real shipped pack.
 *
 * The server has no live-database test infrastructure, so the rulebook that
 * production fills from core_rule_packs.payload is filled here from the same
 * pack the importer would have written. Reading the shipped content rather
 * than a hand-built stub is what keeps these suites describing the real
 * rulebook.
 * @returns Nothing; the rulebook is module state
 */
export const usePackRulebook = async (): Promise<void> => {
  const pack = await assembleCoreRulePack(PACK_DIR);
  setPackRulebookForTests(toRuleSnapshot(pack));
};
