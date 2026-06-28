// apps/server/src/routes/character.ts
import { Router, type Router as ExpressRouter } from "express";
import { db } from "@project/database";
import { characters } from "@project/database/src/schema.js";
import { CharacterFlavorSchema } from "@project/shared";
import { eq } from "drizzle-orm";

const router: ExpressRouter = Router();

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
      .where(eq(characters.userId, userId))
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
