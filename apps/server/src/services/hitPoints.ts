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

/**
 * A stored character's maximum hit points.
 *
 * characters.max_hp holds the base rolled hit points alone, so every clamp
 * and every display has to derive the rest - the Constitution modifier for
 * each level and any MAX_HP trait (#78). This is the one place the server
 * loads a character to do it.
 * @param characterId The character to measure
 * @returns The maximum hit points, or 0 for a character that does not exist
 */
export const deriveMaxHp = async (characterId: string): Promise<number> => {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  if (!character) return 0;

  const ledger = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
      subclassId: characterClasses.subclassId,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  const { snapshot } = await getCachedRuleSnapshot();

  return finalMaxHp(
    toCharacterSave(
      character,
      ledger,
      readStoredChoices(character.choices, characterId),
    ),
    snapshot,
  );
};
