import { db } from "@project/database";
import { Router, type Router as ExpressRouter } from "express";
import {
  classes,
  classLevels,
  classProgressions,
  races,
  subclasses,
  subraces,
  traits,
} from "@project/database/src/reference.js";
import { eq } from "drizzle-orm";

const router: ExpressRouter = Router();

/**
 * GET /api/reference/races
 * Returns all races. If `requiresSubrace` is true, the `subraces` array will be populated.
 */
router.get("/races", async (req, res, next) => {
  try {
    // fetch all base races
    const allRaces = await db.select().from(races);

    // fetch all subraces and bundle them efficiently in memory
    const allSubraces = await db.select().from(subraces);

    // map subraces to their parent race
    const payload = allRaces.map((race) => ({
      ...race,
      subraces: race.requiresSubrace
        ? allSubraces.filter((sr) => sr.parentRaceId === race.id)
        : [],
    }));

    return res.status(200).json({ races: payload });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/classes
 * Returns all base classes with their strict subclass requirement triggers.
 */
router.get("/classes", async (req, res, next) => {
  try {
    const allClasses = await db.select().from(classes);
    return res.status(200).json({ classes: allClasses });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/classes/:id/subclasses
 * Fetches the valid subclasses for a specific base class.
 */
router.get("/classes/:id/subclasses", async (req, res, next) => {
  try {
    const classId = req.params.id;

    const validSubclasses = await db
      .select()
      .from(subclasses)
      .where(eq(subclasses.parentClassId, classId));

    return res.status(200).json({ subclasses: validSubclasses });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/classes/:id/timeline
 * Builds on the 1-to-20 progression array, merging class level sand granted traits
 */
router.get("classes/:id/timeline", async (req, res, next) => {
  try {
    const classId = req.params.id;

    // Fetch the raw scaling metadata for levels 1-20
    const levels = await db
      .select()
      .from(classLevels)
      .where(eq(classLevels.classId, classId));

    // Fetch all traits granted by this class across all levels
    // join the classProgressions junction table with the actual traits table
    const grantedFeatures = await db
      .select({ level: classProgressions.level, trait: traits }) // pull the entire trait object (including flavour lore)
      .from(classProgressions)
      .innerJoin(traits, eq(classProgressions.traitId, traits.id))
      .where(eq(classProgressions.classId, classId));

    // assemble timeline array for frontend
    const timeline = Array.from({ length: 20 }, (_, i) => {
      const currentLevel = i + 1;
      const levelMeta = levels.find((l) => l.level === currentLevel);
      const featuresAtLevel = grantedFeatures
        .filter((f) => f.level === currentLevel)
        .map((f) => f.trait);

      return {
        level: currentLevel,
        scaling: levelMeta?.classSpecificScaling || null,
        spellcasting: levelMeta?.spellcastingProgression || null,
        features: featuresAtLevel,
      };
    });

    return res.status(200).json({ timeline });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/traits/:id
 * Dedicated lookup for in-game Compendium modal.
 */
router.get("/traits/:id", async (req, res, next) => {
  try {
    const traitId = req.params.id;

    const [trait] = await db
      .select()
      .from(traits)
      .where(eq(traits.id, traitId))
      .limit(1);

    if (!trait) {
      return res.status(404).json({ error: "Reference data not found" });
    }

    return res.status(200).json({ trait });
  } catch (error) {
    next(error);
  }
});

export default router;
