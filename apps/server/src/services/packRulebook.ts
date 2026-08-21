import { db } from "@project/database";
import { coreRulePacks } from "@project/database/src/schema/reference.js";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { desc } from "drizzle-orm";

/**
 * The loaded pack's rulebook, held for synchronous readers.
 *
 * levelUpValidation resolves classes, subclasses and traits by id inside pure
 * synchronous functions with a wide call surface. Threading a snapshot through
 * every one of them would touch far more call sites than it would clarify, so
 * the rulebook is primed once at boot - the same shape the reference provider
 * and its cache already use.
 *
 * Empty until primed. A caller that finds it empty is running before boot
 * completed or against a database with no imported pack, and resolving to
 * nothing is the honest answer in both cases.
 */
const EMPTY: CoreRulePackSnapshot = {
  traitsById: {},
  racesById: {},
  classesById: {},
  subclassesById: {},
};

let rulebook: CoreRulePackSnapshot = EMPTY;

/**
 * Reads the newest pack payload and holds it for synchronous lookups.
 *
 * Read from core_rule_packs.payload rather than the relation tables: those
 * store `effects: []` by design and are a query model for the browse
 * endpoints, so a rulebook built from them would carry traits that do nothing.
 * @returns Nothing; the rulebook is module state
 */
export const primePackRulebook = async (): Promise<void> => {
  const [row] = await db
    .select({ payload: coreRulePacks.payload })
    .from(coreRulePacks)
    .orderBy(desc(coreRulePacks.version))
    .limit(1);

  if (!row) {
    console.warn(
      "[packRulebook] No core rule pack imported; rules lookups will resolve to nothing. Run db:import-pack.",
    );
    rulebook = EMPTY;
    return;
  }

  rulebook = toRuleSnapshot(row.payload);
  console.log(
    `[packRulebook] Loaded ${Object.keys(rulebook.classesById).length} classes, ${Object.keys(rulebook.traitsById).length} traits.`,
  );
};

/**
 * The rulebook every synchronous rules lookup on the server reads.
 * @returns Pack content keyed by id, empty if no pack has been primed
 */
export const getPackRulebook = (): CoreRulePackSnapshot => rulebook;

/** Replaces the rulebook directly. For tests, which have no database. */
export const setPackRulebookForTests = (
  next: Partial<CoreRulePackSnapshot>,
): void => {
  rulebook = { ...EMPTY, ...next };
};

/** Restores the empty rulebook between tests. */
export const resetPackRulebookForTests = (): void => {
  rulebook = EMPTY;
};
