// apps/server/src/routes/character.ts
import { Router, type Router as ExpressRouter } from "express";
import { db } from "@project/database";
import {
  campaignMembers,
  campaigns,
  characterClasses,
  characterCustomTraits,
  characters,
} from "@project/database/src/schema/operational.js";
import { CreateCharacterPayloadSchema } from "@project/shared";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { processStartingEquipment } from "../utils/inventory.js";

const router: ExpressRouter = Router();
type CampaignWriteDb = Pick<typeof db, "select" | "insert">;

const isUserCampaignMember = async (
  userId: string,
  campaignId: string,
): Promise<boolean> => {
  const [membership] = await db
    .select()
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.campaignId, campaignId),
      ),
    )
    .limit(1);

  return !!membership;
};

const resolveDefaultCampaignForUser = async (
  tx: CampaignWriteDb,
  userId: string,
): Promise<string> => {
  const [existingMembership] = await tx
    .select()
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, userId))
    .limit(1);

  if (existingMembership) {
    return existingMembership.campaignId;
  }

  const campaignId = uuidv4();
  await tx.insert(campaigns).values({
    id: campaignId,
    name: `${userId}'s Campaign`,
    createdByUserId: userId,
  });

  await tx.insert(campaignMembers).values({
    campaignId,
    userId,
    role: "owner",
  });

  return campaignId;
};

const fetchCharacterPayload = async (userId: string, characterId: string) => {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character) return null;
  const canAccess = await isUserCampaignMember(userId, character.campaignId);
  if (!canAccess) return null;

  const classLedger = await db
    .select()
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId));

  return {
    ...character,
    classLevels: Object.fromEntries(
      classLedger.map((entry) => [entry.classId, entry.classLevel]),
    ),
  };
};

/**
 * POST /api/character
 * Fetches the active user's single character sheet for initial hydration.
 */
router.post("/", async (req, res, next) => {
  try {
    // strict boundary validation
    const payload = CreateCharacterPayloadSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    if (
      payload.campaignId &&
      !(await isUserCampaignMember(userId, payload.campaignId))
    ) {
      return res.status(403).json({ error: "Forbidden campaign access." });
    }

    // generate the UUID for the new character
    const newCharacterId = uuidv4();

    // execute atomic transaction
    await db.transaction(async (tx) => {
      if (!payload.subraceId) {
        throw new Error("subraceId is required for character creation");
      }

      const campaignId = payload.campaignId
        ? payload.campaignId
        : await resolveDefaultCampaignForUser(tx, userId);

      // insert the base character record
      await tx.insert(characters).values({
        id: newCharacterId,
        campaignId,
        name: payload.name,
        level: 1,
        raceId: payload.raceId,
        subraceId: payload.subraceId,

        // flatten ability scores for relational queries
        str: payload.baseAbilityScores.str,
        dex: payload.baseAbilityScores.dex,
        con: payload.baseAbilityScores.con,
        int: payload.baseAbilityScores.int,
        wis: payload.baseAbilityScores.wis,
        cha: payload.baseAbilityScores.cha,

        alignment: payload.alignment,

        // background logic
        backgroundId:
          payload.background.type === "PRESET"
            ? (payload.background.presetId ?? undefined)
            : undefined,
        // custom background config store as immutable JSONB on the character
        customBackgroundData:
          payload.background.type === "CUSTOM"
            ? (payload.background.customData ?? undefined)
            : undefined,

        personalityTraits: payload.personality.traits,
        ideals: payload.personality.ideals,
        bonds: payload.personality.bonds,
        flaws: payload.personality.flaws,
      });

      // insert the lvl 1 class progression
      await tx.insert(characterClasses).values({
        characterId: newCharacterId,
        classId: payload.classId,
        subclassId: payload.subclassId ?? undefined,
        classLevel: 1,
      });

      // handle custom background traits
      if (
        payload.background.type === "CUSTOM" &&
        payload.background.customData
      ) {
        const {
          skillTraitIds,
          toolLanguageTraitIds,
          name: bgName,
        } = payload.background.customData;
        const allCustomTraitIds = [...skillTraitIds, ...toolLanguageTraitIds];

        if (allCustomTraitIds.length > 0) {
          const customTraitsToInsert = allCustomTraitIds.map((traitId) => ({
            characterId: newCharacterId,
            traitId: traitId,
            sourceOrigin: `Background: Custom (${bgName})`,
          }));

          await tx.insert(characterCustomTraits).values(customTraitsToInsert);
        }
      }

      // process and inject starting equipment
      await processStartingEquipment(
        tx,
        newCharacterId,
        payload.startingEquipment,
      );
    }); // end transaction

    // return the created id so frontend can redirect to livesheet
    return res.status(201).json({
      success: true,
      characterId: newCharacterId,
      message: "Character successfully initialized",
    });
  } catch (error) {
    // let global error handler catch zod validation errors or sql constraints
    next(error);
  }
});

/**
 * GET /api/character
 * Fetches the active user's single character sheet for initial hydration.
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    const requestedCharacterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const characterId = requestedCharacterId;

    if (!characterId) {
      return res.status(400).json({
        error: "characterId query parameter is required.",
      });
    }

    const payload = await fetchCharacterPayload(userId, characterId);
    if (!payload) {
      return res.status(404).json({ error: "No active character found." });
    }

    return res.status(200).json({ character: payload });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/character/:characterId
 * Fetches a character by explicit character id.
 */
router.get("/:characterId", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    const payload = await fetchCharacterPayload(userId, req.params.characterId);
    if (!payload) {
      return res.status(404).json({ error: "No active character found." });
    }
    return res.status(200).json({ character: payload });
  } catch (error) {
    next(error);
  }
});

export default router;
