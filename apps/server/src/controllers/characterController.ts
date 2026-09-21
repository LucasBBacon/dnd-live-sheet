import { db } from "@project/database";
import {
  characterClasses,
  characters,
  characterTraits,
} from "@project/database/src/schema/operational.js";
import type { LevelUpPayload } from "@project/shared";
import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { CharacterBootstrapper } from "@project/engine";
import {
  resolveNextLevelValidationContext,
  validateMulticlassPrerequisites,
  validateLevelUpPayloadFromResolver,
} from "../services/levelUpValidation.js";
import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";
import {
  buildLevelUpSaves,
  finalAbilityScores,
  questionsNewAtLevel,
  readStoredChoices,
} from "../services/characterSave.js";
import { classLedgerOrder } from "../services/classLedger.js";
import { z } from "zod";

/** The shape both level-up pick maps share: a key to an array of option ids. */
const PicksShapeSchema = z.record(z.string(), z.array(z.string()));

/**
 * Shape-checks a level-up payload's pick map before it ever reaches a merge
 * or a write. `undefined` (the field was not sent) is left alone; anything
 * sent that is not string[] keyed by string throws, with a message the route
 * recognises as a 400 rather than a 500.
 * @param value The raw payload field, untrusted.
 * @param fieldName The payload field this value came from, for the error.
 * @returns The same picks, typed, or undefined if none were sent.
 */
const parsePicksShape = (
  value: unknown,
  fieldName: "selectedTraits" | "traitSelections",
): Record<string, string[]> | undefined => {
  if (value === undefined) return undefined;

  const parsed = PicksShapeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid character choices: ${fieldName} must map each key to an array of strings.`,
    );
  }
  return parsed.data;
};

/**
 * Applies a level-up to a character.
 * @param req The incoming request object containing the level-up payload.
 * @param res The response object used to send HTTP responses.
 */
export const applyLevelUp = async (req: Request, res: Response) => {
  const payload: LevelUpPayload = req.body;
  const { characterId, targetClassId, newTotalLevel } = payload;

  try {
    // shape-checked before anything is read or written, so a malformed pick
    // map never reaches a merge or the database
    const selectedTraits = parsePicksShape(payload.selectedTraits, "selectedTraits");
    const traitSelections = parsePicksShape(payload.traitSelections, "traitSelections");

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
        .where(eq(characterClasses.characterId, characterId))
        .orderBy(...classLedgerOrder);

      // the character's answers before this level, read early: the
      // multiclass prerequisite check below needs them to build the save
      // finalAbilityScores reads from (#77)
      const storedChoices = readStoredChoices(character.choices, characterId);

      // loaded unconditionally: the lock and required-answer checks below
      // (#69) need it for every level-up, not only ones that send picks
      const { snapshot } = await getCachedRuleSnapshot();

      // the character before and after this level - the same construction
      // the level-up options use to list the questions the wizard asks, so
      // what this level requires is exactly what the wizard offered. The
      // subclass is the payload's, else the one stored for this class (#69)
      const saves = buildLevelUpSaves({
        character,
        ledger: existingClasses,
        storedChoices,
        targetClassId,
        subclassId: payload.subclassId,
        featId: payload.featId,
        selectedTraits,
        traitSelections,
      });
      const { isMulticlassDip, targetClassLevel, targetClassRecord } = saves;

      // 3 - SERVER VALIDATION
      if (isMulticlassDip) {
        // the character as it is before this level: the stored ledger and
        // choices, not this level-up's changes - a multiclass prerequisite
        // is checked against final scores, not the pre-racial ones stored on
        // the row (#77)
        validateMulticlassPrerequisites({
          classId: targetClassId,
          currentBaseScores: finalAbilityScores(saves.before, snapshot),
        });
      }

      // resolve next level validation context for character's class progression
      // against the same subclass track the required check below sees: the
      // payload's subclass, else the one already stored for this class
      const resolverContext = resolveNextLevelValidationContext({
        classId: targetClassId,
        currentClassLevel: targetClassLevel - 1,
        isMulticlassDip,
        ...(saves.subclassId !== null
          ? { requestedSubclassId: saves.subclassId }
          : {}),
      });

      // validate the payload structure against resolver context
      validateLevelUpPayloadFromResolver({
        payload,
        context: resolverContext,
      });

      // an answer already on the character's row is locked: this level-up
      // cannot resend it, whether or not the new value would differ (#69)
      for (const nodeId of Object.keys(selectedTraits ?? {})) {
        if (storedChoices.classSelections[targetClassId]?.[nodeId]?.length) {
          throw new Error(`Invalid character choices: ${nodeId} already answered`);
        }
      }
      for (const blockId of Object.keys(traitSelections ?? {})) {
        if (storedChoices.traitSelections[blockId]?.length) {
          throw new Error(`Invalid character choices: ${blockId} already answered`);
        }
      }

      if (payload.featId) {
        // a feat is a choice like any other: it lives in choices.feats and the
        // bootstrapper grants its traits. It used to become feat_selection
        // rows that no save ever read, so it did nothing (#75)
        //
        // buildLevelUpSaves above already put it in the after save's feats,
        // ahead of the choice validation below: a feat whose traits carry
        // their own choice block must be there when that validation runs, or
        // the same-payload answer to its choice block has no matching
        // decision yet and is rejected as an orphan_selection (#75 latent).
        // Here it is only checked: it has to exist, and a non-repeatable
        // feat cannot be taken twice
        const feat = snapshot.featsById?.[payload.featId];
        if (!feat) {
          throw new Error(
            `Invalid character choices: unknown feat ${payload.featId}`,
          );
        }
        if (!feat.repeatable && storedChoices.feats.includes(payload.featId)) {
          throw new Error(
            `Invalid character choices: ${payload.featId} already taken`,
          );
        }
      }

      const mergedChoices = saves.choicesAfterLevel;

      const issues = CharacterBootstrapper.collectChoiceIssues(
        saves.after,
        snapshot,
      );

      // a question that exists both before and after this level (an open
      // question carried over from creation, or an earlier level) is never
      // required here - only one this level newly unlocks and still has no
      // answer for (#69)
      const missing = questionsNewAtLevel(saves, snapshot).filter(
        (question) => question.selected.length === 0,
      );

      const messages = [
        ...issues.map((issue) => issue.message),
        ...missing.map(
          (question) => `${question.source.name}: nothing selected for ${question.id}`,
        ),
      ];
      if (messages.length > 0) {
        throw new Error(`Invalid character choices: ${messages.join("; ")}`);
      }

      // 4 - update class ledger
      if (targetClassRecord) {
        await tx
          .update(characterClasses)
          .set({
            classLevel: targetClassLevel,
            subclassId: saves.subclassId,
          })
          .where(eq(characterClasses.id, targetClassRecord.id));
      } else {
        await tx.insert(characterClasses).values({
          characterId,
          classId: targetClassId,
          classLevel: targetClassLevel,
          subclassId: saves.subclassId,
          // a dip takes the next place after every class already taken (#74)
          position:
            Math.max(-1, ...existingClasses.map((entry) => entry.position)) + 1,
        });
      }

      // 5 - materialize granted traits from resolver context
      const grantedTraits = resolverContext.grantedTraitIds;
      const grantedTraitSource =
        isMulticlassDip && targetClassLevel === 1
          ? `multiclass_grant:${targetClassId}:level_${targetClassLevel}`
          : `${targetClassId}_level_${targetClassLevel}`;

      const traitsToInsert = grantedTraits.map((traitId) => ({
        characterId,
        traitId,
        source: grantedTraitSource,
      }));

      if (traitsToInsert.length > 0) {
        await tx.insert(characterTraits).values(traitsToInsert);
      }

      // 6 - apply ASI or Feats
      const asiUpdates: Record<string, unknown> = {};
      if (payload.asiChoices) {
        for (const choice of payload.asiChoices) {
          // dynamically build SQL update for specific stat col
          asiUpdates[choice.stat] =
            sql`${characters[choice.stat as keyof typeof characters]} + ${choice.value}`;
        }
      }
      // a picked feat already joined mergedChoices above, ahead of any write;
      // the bootstrapper grants its traits from choices.feats at read time,
      // so no trait row is written for it here

      // 7 - mutate top level character state
      await tx
        .update(characters)
        .set({
          level: newTotalLevel,
          maxHp: sql`${characters.maxHp} + ${payload.hpRoll}`,
          currentHp: sql`${characters.currentHp} + ${payload.hpRoll}`,
          ...asiUpdates,
          choices: mergedChoices,
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
