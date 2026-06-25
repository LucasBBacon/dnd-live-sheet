// apps/server/src/routes/character.ts
import { Router } from "express";
import { db } from "@project/database";
import { characters } from "@project/database/src/schema.js";
import { CharacterFlavorSchema } from "@project/shared";
import { eq } from "drizzle-orm";
const router = Router();
/**
 * GET /api/character
 * Fetches the active user's single character sheet for initial hydration.
 */
router.get("/", async (req, res, next) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        next(error);
    }
});
/**
 * PATCH /api/character/flavor
 * Directly mutates the flavor JSONB column. Bypasses all engine recalculations.
 */
router.patch("/flavor", async (req, res, next) => {
    try {
        const userId = req.user.id;
        // 1. Strict Gatekeeper: Validate incoming payload against the Shared Contract
        // We use .partial() because the user might only be updating one field (e.g., eyeColor)
        const payload = CharacterFlavorSchema.partial().parse(req.body);
        // 2. Fetch the current flavor state to merge updates safely
        const [existing] = await db
            .select({ flavorData: characters.flavorData })
            .from(characters)
            .where(eq(characters.userId, userId))
            .limit(1);
        if (!existing) {
            return res.status(404).json({ error: "Character not found." });
        }
        // 3. Merge and update the JSONB column
        const updatedFlavor = {
            ...existing.flavorData,
            ...payload,
        };
        const [updatedCharacter] = await db
            .update(characters)
            .set({
            flavorData: updatedFlavor,
            updatedAt: new Date(),
        })
            .where(eq(characters.userId, userId))
            .returning(); // Instruct Postgres to return the mutated row
        if (!updatedCharacter) {
            return res
                .status(500)
                .json({ error: "Failed to commit character updates." });
        }
        return res.status(200).json({ flavor: updatedCharacter.flavorData });
    }
    catch (error) {
        next(error); // Passes ZodErrors directly to the global error handler
    }
});
export default router;
//# sourceMappingURL=character.js.map