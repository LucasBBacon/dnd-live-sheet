// apps/server/src/routes/character.ts
import { Router, type Router as ExpressRouter } from "express";
import { db } from "@project/database";
import {
  characterClasses,
  characterCustomTraits,
  characters,
} from "@project/database/src/schema/operational.js";
import { CreateCharacterPayloadSchema } from "@project/shared";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router: ExpressRouter = Router();

/**
 * POST /api/character
 * Fetches the active user's single character sheet for initial hydration.
 */
router.post("/", async (req, res, next) => {
  try {
    // strict boundary validation
    const payload = CreateCharacterPayloadSchema.parse(req.body);

    // generate the UUID for the new character
    const newCharacterId = uuidv4();

    // execute atomic transaction
    await db.transaction(async (tx) => {
      // insert the base character record
      await tx.insert(characters).values({
        id: newCharacterId,
        name: payload.name,
        raceId: payload.raceId,
        subraceId: payload.subraceId ?? undefined,

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
        level: 1, // fresh characters always start at lvl 1 in this class
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

      // TODO - Parse and allocate starting equipment based on class/background choices
      // something like await processStartingEquipment(...)
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
    const userId = req.user!.id;

    // Utilize Drizzle to fetch the specific user's character
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, userId))
      .limit(1);

    if (!character) {
      return res.status(404).json({ error: "No active character found." });
    }

    return res.status(200).json({ character });
  } catch (error) {
    next(error);
  }
});

export default router;
