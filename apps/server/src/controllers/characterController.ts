import { db } from "@project/database";
import {
  characterClasses,
  characters,
  characterTraits,
} from "@project/database/src/schema/operational.js";
import { classProgressions } from "@project/database/src/schema/reference.js";
import type { LevelUpPayload } from "@project/shared";
import type { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { ProgressionEngine } from "@project/engine";

export const applyLevelUp = async (req: Request, res: Response) => {
  const payload: LevelUpPayload = req.body;
  const { characterId, targetClassId, newTotalLevel } = payload;

  try {
    await db.transaction(async (tx) => {
      // 1 - fetch current character state securely
      const [character] = await tx
        .select()
        .from(characters)
        .where(eq(characters.id, characterId));
      if (!character) throw new Error("Character not found.");

      // 2 - fetch existing class ledger to determine if this is a dip or a main progression
      const existingClasses = await tx
        .select()
        .from(characterClasses)
        .where(eq(characterClasses.characterId, characterId));
      const targetClassRecord = existingClasses.find(
        (c) => c.classId === targetClassId,
      );

      const isMulticlassDip = !targetClassRecord && existingClasses.length > 0;
      const targetClassLevel = (targetClassRecord?.classLevel || 0) + 1;

      // 3 - SERVER VALIDATION
      if (isMulticlassDip) {
        ProgressionEngine.validateMulticlassPrerequisites(targetClassId, {
          str: character.str,
          dex: character.dex,
          con: character.con,
          int: character.int,
          wis: character.wis,
          cha: character.cha,
        });
      }

      // validate the payload structure against dict
      ProgressionEngine.validateLevelUp(
        targetClassId,
        targetClassLevel,
        payload,
      );

      // 4 - update class ledger
      if (targetClassRecord) {
        await tx
          .update(characterClasses)
          .set({
            classLevel: targetClassLevel,
            subclassId: payload.subclassId || targetClassRecord.subclassId,
          })
          .where(eq(characterClasses.id, targetClassRecord.id));
      } else {
        await tx.insert(characterClasses).values({
          characterId,
          classId: targetClassId,
          classLevel: targetClassLevel,
          subclassId: payload.subclassId,
        });
      }

      // 5 - materialize granted traits
      // class progression traits are DB-backed; multiclass dip level-1 remains engine-rule specific
      const grantedTraits = isMulticlassDip && targetClassLevel === 1
        ? ProgressionEngine.getGrantedTraitsForLevel(
            targetClassId,
            targetClassLevel,
            true,
          )
        : (
            await tx
              .select({ traitId: classProgressions.traitId })
              .from(classProgressions)
              .where(
                and(
                  eq(classProgressions.classId, targetClassId),
                  eq(classProgressions.level, targetClassLevel),
                ),
              )
          ).map((row) => row.traitId);

      const traitsToInsert = grantedTraits.map((traitId) => ({
        characterId,
        traitId,
        source: `${targetClassId}_level_${targetClassLevel}`,
      }));

      // append manually selected traits
      if (payload.selectedTraits) {
        Object.values(payload.selectedTraits)
          .flat()
          .forEach((traitId) => {
            traitsToInsert.push({
              characterId,
              traitId,
              source: "player_choice",
            });
          });
      }

      if (traitsToInsert.length > 0) {
        await tx.insert(characterTraits).values(traitsToInsert);
      }

      // 6 - apply ASI or Feats
      let asiUpdates: Record<string, unknown> = {};
      if (payload.asiChoices) {
        for (const choice of payload.asiChoices) {
          // dynamically build SQL update for specific stat col
          asiUpdates[choice.stat] =
            sql`${characters[choice.stat as keyof typeof characters]} + ${choice.value}`;
        }
      } else if (payload.featId) {
        await tx.insert(characterTraits).values({
          characterId,
          traitId: payload.featId,
          source: "feat_selection",
        });
      }

      // 7 - mutate top level character state
      await tx
        .update(characters)
        .set({
          level: newTotalLevel,
          maxHp: sql`${characters.maxHp} + ${payload.hpRoll}`,
          currentHp: sql`${characters.currentHp} + ${payload.hpRoll}`,
          ...asiUpdates,
        })
        .where(eq(characters.id, characterId));
    });

    res
      .status(200)
      .json({ success: true, message: "Level up applied successfully." });
  } catch (error: any) {
    console.error("Level Up Transaction Failed:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};
