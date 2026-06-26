import { db } from "@project/database";
import { Router, type Router as ExpressRouter } from "express";
import {
  classes,
  classLevels,
  classProgressions,
  races,
  raceTraits,
  subclasses,
  subraces,
  subraceTraits,
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

    // fetch all traits tied to base races
    const fullyResolvedRaceTraits = await db
      .select({ raceId: raceTraits.raceId, trait: traits })
      .from(raceTraits)
      .innerJoin(traits, eq(raceTraits.traitId, traits.id));

    // fetch all traits tied to subraces
    const fullyResolvedSubraceTraits = await db
      .select({ subraceId: subraceTraits.subraceId, traits: traits })
      .from(subraceTraits)
      .innerJoin(traits, eq(subraceTraits.traitId, traits.id));

    // map subraces to their parent race with explicit provenance
    const payload = allRaces.map((race) => {
      // filter traits for this race and map them with an explicit source header
      const baseTraits = fullyResolvedRaceTraits
        .filter((rt) => rt.raceId === race.id)
        .map((rt) => ({ ...rt.trait, sourceOrigin: `Race: ${race.name}` }));

      const associatedSubraces = allSubraces
        .filter((sr) => sr.parentRaceId === race.id)
        .map((subrace) => {
          const subTraits = fullyResolvedSubraceTraits
            .filter((st) => st.subraceId === subrace.id)
            .map((st) => ({
              ...st.traits,
              sourceOrigin: `Subrace: ${subrace.name}`, // hard metadata source track
            }));

          return {
            ...subrace,
            traits: subTraits,
          };
        });

      return {
        ...race,
        traits: baseTraits,
        subraces: associatedSubraces,
      };
    });

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
router.get('/classes/:id/timeline', async (req, res, next) => {
  try {
    const classId = req.params.id;

    // 1. Fetch the raw scaling metadata for levels 1-20
    const levels = await db
      .select()
      .from(classLevels)
      .where(eq(classLevels.classId, classId));

    // 2. Fetch all traits granted by this class across all levels
    // We join the classProgressions junction table with the actual traits table
    const grantedFeatures = await db
      .select({
        level: classProgressions.level,
        trait: traits, // Pull the entire trait object (including flavor lore)
      })
      .from(classProgressions)
      .innerJoin(traits, eq(classProgressions.traitId, traits.id))
      .where(eq(classProgressions.classId, classId));

    // 3. Assemble the timeline array for the frontend
    const timeline = Array.from({ length: 20 }, (_, i) => {
      const currentLevel = i + 1;
      const levelMeta = levels.find(l => l.level === currentLevel) || {};
      const featuresAtLevel = grantedFeatures
        .filter(f => f.level === currentLevel)
        .map(f => f.trait);

      return {
        level: currentLevel,
        scaling: levelMeta.classSpecificScaling || null,
        spellcasting: levelMeta.spellcastingProgression || null,
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
