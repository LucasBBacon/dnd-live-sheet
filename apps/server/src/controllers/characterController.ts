import { db } from "@project/database";
import {
  characterClasses,
  characters,
  characterTraits,
} from "@project/database/src/schema/operational.js";
import type { LevelUpPayload } from "@project/shared";
import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { CharacterBootstrapper, type RuleSnapshotLookup } from "@project/engine";
import {
  resolveNextLevelValidationContext,
  validateMulticlassPrerequisites,
  validateLevelUpPayloadFromResolver,
} from "../services/levelUpValidation.js";
import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";
import {
  buildLevelUpSaves,
  finalAbilityScores,
  finalMaxHp,
  questionsNewAtLevel,
  readStoredChoices,
  type CharacterClassSource,
  type LevelUpSaves,
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
 * The hit points a level-up adds to a character's current total: the
 * difference between the maximum after this level and the maximum before it.
 * The roll, this level's Constitution modifier, an ability score increase
 * taken at this level and any MAX_HP trait it grants all count once, so the
 * wizard's preview and the stored number cannot disagree (#78).
 * @param saves The character before and after this level (buildLevelUpSaves)
 * @param payload The level-up's roll and any ability score increases
 * @param snapshot Pack content
 * @returns The hit points to add to current hit points
 */
export const levelUpHitPointGain = ({
  saves,
  payload,
  snapshot,
}: {
  saves: Pick<LevelUpSaves<CharacterClassSource>, "before" | "after">;
  payload: Pick<LevelUpPayload, "hpRoll" | "asiChoices">;
  snapshot: RuleSnapshotLookup;
}): number => {
  const attributes = { ...saves.after.attributes };
  for (const choice of payload.asiChoices ?? []) {
    const key = choice.stat.toLowerCase() as keyof typeof attributes;
    attributes[key] += choice.value;
  }

  const after = finalMaxHp(
    {
      ...saves.after,
      attributes,
      hp: {
        ...saves.after.hp,
        baseRolledHp: saves.after.hp.baseRolledHp + payload.hpRoll,
      },
    },
    snapshot,
  );

  return after - finalMaxHp(saves.before, snapshot);
};

/** Whatever can `.select()`: the module `db`, or a caller's transaction. */
type LevelUpExecutor = Pick<typeof db, "select">;

/** The draft fields a level-up's saves depend on (#88). */
interface LevelUpDraft {
  targetClassId: string;
  subclassId?: string | undefined;
  featId?: string | undefined;
  selectedTraits?: Record<string, string[]> | undefined;
  traitSelections?: Record<string, string[]> | undefined;
}

/**
 * Reads the character a level-up acts on and builds it before and after.
 *
 * applyLevelUp and previewLevelUp both call this, so the preview measures
 * exactly the saves the write stores (#88). applyLevelUp passes its
 * transaction with `lock: true`: the character row is read FOR UPDATE, so a
 * second concurrent level-up waits for the first to commit, then reads the
 * ledger the first wrote and fails the ledger check rather than adding a
 * second level's hit points (#94). The preview reads from the pool, unlocked.
 * @param executor The database, or the transaction a level-up runs in
 * @param characterId The character to read
 * @param draft The level-up's class, subclass, feat and picks
 * @param options `lock` takes the row lock; only a write should
 * @returns The class ledger, the stored choices, and the saves
 * @throws Error("Character not found.") when no such row exists
 */
const loadLevelUpSaves = async (
  executor: LevelUpExecutor,
  characterId: string,
  draft: LevelUpDraft,
  { lock }: { lock: boolean },
) => {
  const characterRead = executor
    .select()
    .from(characters)
    .where(eq(characters.id, characterId));
  const [character] = lock
    ? await characterRead.for("update")
    : await characterRead;
  if (!character) throw new Error("Character not found.");

  const existingClasses = await executor
    .select()
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  const storedChoices = readStoredChoices(character.choices, characterId);

  const saves = buildLevelUpSaves({
    character,
    ledger: existingClasses,
    storedChoices,
    targetClassId: draft.targetClassId,
    subclassId: draft.subclassId,
    featId: draft.featId,
    selectedTraits: draft.selectedTraits,
    traitSelections: draft.traitSelections,
  });

  return { existingClasses, storedChoices, saves };
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

    // resolved before the transaction opens: on a cache miss it queries the
    // module db, which from inside the transaction would take a second
    // connection from the pool (#89 final review, F2). The lock and
    // required-answer checks below (#69) need it for every level-up
    const { snapshot } = await getCachedRuleSnapshot();

    await db.transaction(async (tx) => {
      // 1-2 - the character (locked, #94), its class ledger and stored
      // answers, and the character before and after this level - the same
      // construction the level-up options use to list the questions the
      // wizard asks, so what this level requires is exactly what the wizard
      // offered. The subclass is the payload's, else the one stored for this
      // class (#69)
      const { existingClasses, storedChoices, saves } = await loadLevelUpSaves(
        tx,
        characterId,
        {
          targetClassId,
          subclassId: payload.subclassId,
          featId: payload.featId,
          selectedTraits,
          traitSelections,
        },
        { lock: true },
      );

      // the new total level comes from the ledger this transaction is about
      // to extend, never from the request. A level-up adds exactly one class
      // level, and since #78 the sheet's maximum hit points and both health
      // clamps derive from a level - so a column that disagrees with these
      // rows is visible, not cosmetic (#90)
      const derivedTotalLevel =
        existingClasses.reduce((total, row) => total + row.classLevel, 0) + 1;
      if (newTotalLevel !== derivedTotalLevel) {
        throw new Error(
          `Invalid character choices: newTotalLevel ${newTotalLevel} does not match the class ledger (${derivedTotalLevel})`,
        );
      }

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

      // a stored subclass is a locked answer too: once the target class's
      // ledger row already has one, this level-up may resend that same id
      // (a no-op) but not name a different one. A blank subclassId means
      // "none", matching buildLevelUpSaves' `||` (#84)
      const storedSubclassId = targetClassRecord?.subclassId ?? null;
      if (
        storedSubclassId &&
        payload.subclassId &&
        payload.subclassId !== storedSubclassId
      ) {
        throw new Error(
          `Invalid character choices: ${targetClassId} already has subclass ${storedSubclassId}`,
        );
      }

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

      // a question that exists both before and after this level (an open
      // question carried over from creation, or an earlier level) is never
      // required here - only one this level newly unlocks and still has no
      // answer for (#69)
      const newQuestions = questionsNewAtLevel(saves, snapshot);
      const missing = newQuestions.filter(
        (question) => question.selected.length === 0,
      );

      // stored answers are locked - no endpoint can re-answer them - so a
      // stored pick that a later grant (or #31a's real spell levels) makes
      // invalid must not block every future level-up with no remedy.
      // Level-up rejects a choice issue only when it is on a node this
      // payload answers or this level newly asks; a stale stored pick stays
      // recorded as it is (#84). Creation still validates the whole save.
      const nodesInScope = new Set<string>([
        ...Object.keys(selectedTraits ?? {}),
        ...Object.keys(traitSelections ?? {}),
        ...newQuestions.map((question) => question.id),
      ]);
      const issues = CharacterBootstrapper.collectChoiceIssues(
        saves.after,
        snapshot,
      ).filter((issue) => issue.nodeId === undefined || nodesInScope.has(issue.nodeId));

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

      const gainedHp = levelUpHitPointGain({ saves, payload, snapshot });

      // 7 - mutate top level character state
      await tx
        .update(characters)
        .set({
          level: derivedTotalLevel,
          maxHp: sql`COALESCE(${characters.maxHp}, 0) + ${payload.hpRoll}`,
          currentHp: sql`COALESCE(${characters.currentHp}, 0) + ${gainedHp}`,
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

/**
 * What a level-up draft would do to hit points, without applying it.
 *
 * Builds the character before and after through the same loadLevelUpSaves
 * applyLevelUp uses, then measures both with finalMaxHp and
 * levelUpHitPointGain - so the level-up wizard previews exactly the number
 * the write will store, including an ability score increase that raises
 * every earlier level's Constitution contribution (#88). Read-only: no
 * transaction, no lock, and no validation of the draft's choices, which the
 * real submit still performs in full.
 * @param req The request, its body the wizard's draft
 * @param res The response: the maximum before and after, and the gain
 */
export const previewLevelUp = async (req: Request, res: Response) => {
  const payload = req.body as Partial<LevelUpPayload> & { characterId: string };
  const { characterId, targetClassId, hpRoll } = payload;

  if (
    typeof targetClassId !== "string" ||
    targetClassId.length === 0 ||
    typeof hpRoll !== "number" ||
    !Number.isFinite(hpRoll)
  ) {
    return res.status(400).json({
      success: false,
      error: "A hit point preview needs a targetClassId and a numeric hpRoll.",
    });
  }

  try {
    const selectedTraits = parsePicksShape(payload.selectedTraits, "selectedTraits");
    const traitSelections = parsePicksShape(payload.traitSelections, "traitSelections");
    const { snapshot } = await getCachedRuleSnapshot();

    const { saves } = await loadLevelUpSaves(
      db,
      characterId,
      {
        targetClassId,
        subclassId: payload.subclassId,
        featId: payload.featId,
        selectedTraits,
        traitSelections,
      },
      { lock: false },
    );

    const maxHpBefore = finalMaxHp(saves.before, snapshot);
    const hitPointGain = levelUpHitPointGain({
      saves,
      payload: {
        hpRoll,
        ...(payload.asiChoices ? { asiChoices: payload.asiChoices } : {}),
      },
      snapshot,
    });

    return res.status(200).json({
      maxHpBefore,
      maxHpAfter: maxHpBefore + hitPointGain,
      hitPointGain,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
};
