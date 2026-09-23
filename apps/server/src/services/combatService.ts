import { db } from "@project/database";
import { characters } from "@project/database/src/schema/operational.js";
import { eq } from "drizzle-orm";
import { deriveMaxHp } from "./hitPoints.js";
import { getCachedRuleSnapshot } from "./ruleSnapshotCache.js";

/**
 * Modifies the current HP of a character by a specified amount, ensuring that the resulting HP does not exceed the character's maximum HP or drop below zero.
 * @param characterId The unique identifier of the character whose HP is to be modified.
 * @param amount The amount by which to modify the character's current HP. Positive values will increase HP, while negative values will decrease it.
 * @returns An object containing the updated current HP, temporary HP (always 0 in this implementation), and maximum HP of the character after the modification.
 */
export const modifyCharacterHp = async (
  characterId: string,
  amount: number,
) => {
  // resolved before the transaction opens, and passed in below: a cache miss
  // here queries the module db, and doing that from inside the transaction
  // below would ask the pool for a second connection while holding one on
  // the app's most travelled write (#89 final review, F2)
  const { snapshot } = await getCachedRuleSnapshot();

  // execute within a strict database transaction
  return await db.transaction(async (tx) => {
    // fetch character and LOCK ROW until transaction completes
    const [character] = await tx
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .for("update");

    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    const currentHp = character.currentHp ?? 0;
    // the row's max_hp is base rolled hit points; the clamp needs the
    // derived maximum (#78). Pass tx: deriveMaxHp must query through this
    // transaction's connection, not the module db, or a full pool of
    // concurrent heals can hang (#78 final review, F1). Pass snapshot too,
    // resolved above, or deriveMaxHp's own cache-miss path reaches for the
    // module db from inside this same transaction (#89 final review, F2)
    const maxHp = await deriveMaxHp(characterId, tx, snapshot);
    // 5E 2014 hp mechanics
    const nextCurrentHp =
      amount < 0
        ? Math.max(0, currentHp + amount)
        : Math.min(maxHp, currentHp + amount);

    await tx
      .update(characters)
      .set({
        currentHp: nextCurrentHp,
      })
      .where(eq(characters.id, characterId));

    return {
      current: nextCurrentHp,
      temporary: 0,
      max: maxHp,
    };
  });
};
