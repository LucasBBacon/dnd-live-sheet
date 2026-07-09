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
import { applyLevelUp } from "../controllers/characterController.js";

const router: ExpressRouter = Router();
/**
 * A type that represents a subset of the database operations used for campaign-related writes.
 */
type CampaignWriteDb = Pick<typeof db, "select" | "insert">;

// #region Helper Functions

/**
 * Checks if a user is a member of a specific campaign.
 * @param userId - The ID of the user.
 * @param campaignId - The ID of the campaign.
 * @returns A promise that resolves to true if the user is a member of the campaign, false otherwise.
 */
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

/**
 * Resolves the default campaign for a user. If the user has no existing campaigns, a new one is created.
 * This ensures that every user has a campaign context for character creation.
 * @param tx - The database transaction object for campaign-related writes.
 * @param userId - The ID of the user for whom to resolve the default campaign.
 * @returns A promise that resolves to the ID of the resolved or newly created campaign.
 */
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

/**
 * Fetches a character payload for a given user and character ID, ensuring the user has access to the character's campaign.
 * @param userId - The ID of the user requesting the character payload.
 * @param characterId - The ID of the character to fetch.
 * @returns A promise that resolves to the character payload if accessible, or null otherwise.
 */
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

// #endregion

// #region POST /api/character

/**
 * POST /api/character
 * Creates a new character for the authenticated user, optionally associating it with a campaign.
 * If no campaign is specified, the system will either use the user's default campaign or create a new one.
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

// #endregion

// #region GET /api/character

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
      typeof req.query.characterId === "string"
        ? req.query.characterId
        : undefined;
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

// #endregion

// #region GET /api/character/:characterId

/**
 * GET /api/character/:characterId
 * Fetches a character by explicit character id.
 * @param characterId - The ID of the character to fetch.
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

// #endregion

// #region POST /api/character/:characterId/level-up

/**
 * POST /api/character/:characterId/level-up
 * Applies a validated level-up payload for the requested character.
 * @param characterId - The ID of the character to level up.
 */
router.post("/:characterId/level-up", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    const characterId = req.params.characterId;
    const [character] = await db
      .select({ id: characters.id, campaignId: characters.campaignId })
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    const canAccess = await isUserCampaignMember(userId, character.campaignId);
    if (!canAccess) {
      return res.status(403).json({ error: "Forbidden campaign access." });
    }

    if (req.body?.characterId && req.body.characterId !== characterId) {
      return res
        .status(400)
        .json({ error: "Character id mismatch in payload." });
    }

    req.body = {
      ...req.body,
      characterId,
    };

    return applyLevelUp(req, res);
  } catch (error) {
    next(error);
  }
});

// #endregion

export default router;
