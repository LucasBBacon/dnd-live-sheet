import { db } from "@project/database";
import { characters } from "@project/database/src/schema/operational.js";
import { eq } from "drizzle-orm";

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
    const maxHp = character.maxHp ?? currentHp;
    let nextCurrentHp = currentHp;

    // 5E 2014 hp mechanics
    if (amount < 0) {
      nextCurrentHp = Math.max(0, currentHp + amount);
    } else {
      nextCurrentHp = Math.min(maxHp, currentHp + amount);
    }

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
