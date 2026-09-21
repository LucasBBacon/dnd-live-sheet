import { db } from "@project/database";
import {
  characterClasses,
  characters,
  characterTraits,
} from "@project/database/src/schema/operational.js";
import type { CharacterChoices, LevelUpPayload } from "@project/shared";
import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { CharacterBootstrapper } from "@project/engine";
import {
  resolveNextLevelValidationContext,
  validateMulticlassPrerequisites,
  validateLevelUpPayloadFromResolver,
} from "../services/levelUpValidation.js";
import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";
import { readStoredChoices, toCharacterSave } from "../services/characterSave.js";
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
      const targetClassRecord = existingClasses.find(
        (c) => c.classId === targetClassId,
      );

      const isMulticlassDip = !targetClassRecord && existingClasses.length > 0;
      const targetClassLevel = (targetClassRecord?.classLevel || 0) + 1;

      // 3 - SERVER VALIDATION
      if (isMulticlassDip) {
        validateMulticlassPrerequisites({
          classId: targetClassId,
          currentBaseScores: {
            str: character.str,
            dex: character.dex,
            con: character.con,
            int: character.int,
            wis: character.wis,
            cha: character.cha,
          },
        });
      }

      // resolve next level validation context for character's class progression
      const resolverContext = resolveNextLevelValidationContext({
        classId: targetClassId,
        currentClassLevel: targetClassLevel - 1,
        isMulticlassDip,
        ...(payload.subclassId !== undefined
          ? { requestedSubclassId: payload.subclassId }
          : {}),
      });

      // validate the payload structure against resolver context
      validateLevelUpPayloadFromResolver({
        payload,
        context: resolverContext,
      });

      // the character's answers after this level: the stored ones plus this
      // payload's, each keyed by the question it answers (#69)
      const storedChoices = readStoredChoices(character.choices, characterId);
      const existingClassPicks = storedChoices.classSelections[targetClassId];
      const classSelections = { ...storedChoices.classSelections };
      // only stake out a classSelections entry for this class when there is
      // something to put in it - a level-up that answers nothing must not
      // leave behind an empty {} the class never actually picked anything for
      if (existingClassPicks || selectedTraits) {
        classSelections[targetClassId] = {
          ...(existingClassPicks ?? {}),
          ...(selectedTraits ?? {}),
        };
      }
      let mergedChoices: CharacterChoices = {
        classSelections,
        traitSelections: {
          ...storedChoices.traitSelections,
          ...(traitSelections ?? {}),
        },
        // carried through as-is here; a feat picked this level joins it below
        feats: storedChoices.feats,
      };

      // loaded once and reused by whichever validation below needs it, rather
      // than fetched separately by choice validation and feat validation
      let snapshot:
        | Awaited<ReturnType<typeof getCachedRuleSnapshot>>["snapshot"]
        | undefined;
      if (selectedTraits || traitSelections || payload.featId) {
        ({ snapshot } = await getCachedRuleSnapshot());
      }

      if (selectedTraits || traitSelections) {
        const ledgerAfterLevel = existingClasses.map((entry) => ({
          classId: entry.classId,
          classLevel:
            entry.classId === targetClassId ? targetClassLevel : entry.classLevel,
          subclassId:
            entry.classId === targetClassId
              ? payload.subclassId || entry.subclassId
              : entry.subclassId,
        }));
        if (!targetClassRecord) {
          ledgerAfterLevel.push({
            classId: targetClassId,
            classLevel: targetClassLevel,
            subclassId: payload.subclassId ?? null,
          });
        }

        const issues = CharacterBootstrapper.collectChoiceIssues(
          toCharacterSave(character, ledgerAfterLevel, mergedChoices),
          snapshot,
        );
        if (issues.length > 0) {
          throw new Error(
            `Invalid character choices: ${issues.map((issue) => issue.message).join("; ")}`,
          );
        }
      }

      if (payload.featId) {
        // a feat is a choice like any other: it lives in choices.feats and the
        // bootstrapper grants its traits. It used to become feat_selection
        // rows that no save ever read, so it did nothing (#75)
        const feat = snapshot?.featsById?.[payload.featId];
        if (!feat) {
          throw new Error(
            `Invalid character choices: unknown feat ${payload.featId}`,
          );
        }
        if (!feat.repeatable && mergedChoices.feats.includes(payload.featId)) {
          throw new Error(
            `Invalid character choices: ${payload.featId} already taken`,
          );
        }
        mergedChoices = {
          ...mergedChoices,
          feats: [...mergedChoices.feats, payload.featId],
        };
      }

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
