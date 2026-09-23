import { db } from "@project/database";
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
import { eq } from "drizzle-orm";
import { classLedgerOrder } from "./classLedger.js";
import {
  finalMaxHp,
  readStoredChoices,
  toCharacterSave,
} from "./characterSave.js";
import { getCachedRuleSnapshot } from "./ruleSnapshotCache.js";
import type { RulesSnapshotPayload } from "./referenceProvider/types.js";

/**
 * The minimal database surface deriveMaxHp needs: whatever can `.select()`
 * - the module-level `db`, or the `tx` a caller's own transaction provides.
 */
type DatabaseExecutor = Pick<typeof db, "select">;

/**
 * A stored character's maximum hit points.
 *
 * characters.max_hp holds the base rolled hit points alone, so every clamp
 * and every display has to derive the rest - the Constitution modifier for
 * each level and any MAX_HP trait (#78). This is the one place the server
 * loads a character to do it.
 *
 * A caller already inside a `db.transaction(...)` must pass its `tx` as
 * `executor`: postgres.js defaults to a pool of 10 connections, and an open
 * transaction holds one of them for its whole duration. Issuing these
 * queries against the module `db` (a different connection) from inside that
 * transaction can leave every concurrent caller waiting on a connection the
 * pool cannot supply, and reads an unlocked, separate snapshot that a
 * concurrent write can race.
 *
 * That same caller must also resolve the rule snapshot *before* opening its
 * transaction and pass it as `snapshot`: `getCachedRuleSnapshot()` queries
 * the module `db` on a cache miss, and calling it from in here while already
 * inside a transaction is the same second-connection problem as `executor`
 * above, on the pool's most contended path (#89 final review, F2).
 * @param characterId The character to measure
 * @param executor The database or transaction to query through; defaults to
 * the module `db`
 * @param snapshot The rule snapshot to derive against; when omitted this
 * calls `getCachedRuleSnapshot()` itself, exactly as before
 * @returns The maximum hit points, or 0 for a character that does not exist
 */
export const deriveMaxHp = async (
  characterId: string,
  executor: DatabaseExecutor = db,
  snapshot?: RulesSnapshotPayload,
): Promise<number> => {
  const [character] = await executor
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  if (!character) return 0;

  const ledger = await executor
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
      subclassId: characterClasses.subclassId,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  const resolvedSnapshot =
    snapshot ?? (await getCachedRuleSnapshot()).snapshot;

  return finalMaxHp(
    toCharacterSave(
      character,
      ledger,
      readStoredChoices(character.choices, characterId),
    ),
    resolvedSnapshot,
  );
};
