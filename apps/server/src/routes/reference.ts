import { db } from "@project/database";
import { Router, type Router as ExpressRouter } from "express";
import {
  backgrounds,
  backgroundTraits,
  classes,
  classLevels,
  classProgressions,
  items,
  races,
  raceTraits,
  subclasses,
  subclassProgressions,
  subraces,
  subraceTraits,
  traits,
} from "@project/database/src/schema/reference.js";
import { and, desc, eq, sql } from "drizzle-orm";

const router: ExpressRouter = Router();

type TraitEffectLike = {
  type?: string;
  category?: string;
};

const hasEffectCategory = (effects: unknown, categories: string[]): boolean => {
  if (!Array.isArray(effects)) return false;

  return effects.some((effect) => {
    if (!effect || typeof effect !== "object") return false;
    const typedEffect = effect as TraitEffectLike;

    if (
      typedEffect.type !== "proficiency" &&
      typedEffect.type !== "proficiency_choice"
    ) {
      return false;
    }

    return (
      typeof typedEffect.category === "string" &&
      categories.includes(typedEffect.category)
    );
  });
};

const matchesTraitCategory = (
  trait: { id: string; name: string; effects: unknown },
  category: string,
): boolean => {
  const id = trait.id.toLowerCase();
  const name = trait.name.toLowerCase();

  if (category === "skills") {
    return (
      hasEffectCategory(trait.effects, ["skills"]) ||
      id.includes("_prof_skills") ||
      name.includes("skill")
    );
  }

  if (category === "tools_and_languages") {
    return (
      hasEffectCategory(trait.effects, ["tools", "languages"]) ||
      id.includes("_prof_tools") ||
      id.includes("_languages") ||
      name.includes("tool") ||
      name.includes("language")
    );
  }

  return false;
};

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
router.get("/classes/:id/timeline", async (req, res, next) => {
  try {
    const classId = req.params.id;
    const requestedSubclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;

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

    let subclassGrantedFeatures: Array<{ level: number; trait: any }> = [];
    if (requestedSubclassId) {
      const [validSubclass] = await db
        .select()
        .from(subclasses)
        .where(
          and(
            eq(subclasses.id, requestedSubclassId),
            eq(subclasses.parentClassId, classId),
          ),
        )
        .limit(1);

      if (validSubclass) {
        const subclassFeatureRows = await db
          .select({
            level: subclassProgressions.level,
            trait: traits,
          })
          .from(subclassProgressions)
          .innerJoin(traits, eq(subclassProgressions.traitId, traits.id))
          .where(eq(subclassProgressions.subclassId, requestedSubclassId));

        subclassGrantedFeatures = subclassFeatureRows.map((row) => ({
          level: row.level,
          trait: {
            ...row.trait,
            sourceOrigin: `Subclass: ${validSubclass.name}`,
          },
        }));
      }
    }

    // 3. Assemble the timeline array for the frontend
    const timeline = Array.from({ length: 20 }, (_, i) => {
      const currentLevel = i + 1;
      const levelMeta = levels.find((l) => l.level === currentLevel);
      const classFeaturesAtLevel = grantedFeatures
        .filter((f) => f.level === currentLevel)
        .map((f) => f.trait);
      const subclassFeaturesAtLevel = subclassGrantedFeatures
        .filter((f) => f.level === currentLevel)
        .map((f) => f.trait);
      const featuresAtLevel = [
        ...classFeaturesAtLevel,
        ...subclassFeaturesAtLevel,
      ];

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
 * GET /api/reference/backgrounds
 * Returns all backgrounds with fully resolved granted trait records.
 */
router.get("/backgrounds", async (req, res, next) => {
  try {
    const allBackgrounds = await db.select().from(backgrounds);

    const resolvedBackgroundTraits = await db
      .select({ backgroundId: backgroundTraits.backgroundId, trait: traits })
      .from(backgroundTraits)
      .innerJoin(traits, eq(backgroundTraits.traitId, traits.id));

    const payload = allBackgrounds.map((background) => {
      const grantedTraits = resolvedBackgroundTraits
        .filter((bt) => bt.backgroundId === background.id)
        .map((bt) => ({
          ...bt.trait,
          sourceOrigin: `Background: ${background.name}`,
        }));

      return {
        ...background,
        traits: grantedTraits,
      };
    });

    return res.status(200).json({ backgrounds: payload });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/traits
 * Query params:
 * - category=skills | tools_and_languages
 */
router.get("/traits", async (req, res, next) => {
  try {
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;

    const allTraits = await db.select().from(traits);

    if (!category) {
      return res.status(200).json({ traits: allTraits });
    }

    if (category !== "skills" && category !== "tools_and_languages") {
      return res.status(400).json({
        error: "Invalid trait category. Use 'skills' or 'tools_and_languages'.",
      });
    }

    const filteredTraits = allTraits.filter((trait) =>
      matchesTraitCategory(
        trait as { id: string; name: string; effects: unknown },
        category,
      ),
    );

    return res.status(200).json({ traits: filteredTraits });
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

/**
 * GET /api/reference/items
 * QUery Parameters:
 * - q: string (Search keywords)
 * - limit: number (Default 50, Max 100 for network safety)
 * - offset: number (For infinite scroll/pagination)
 */
router.get("/items", async (req, res, next) => {
  try {
    const searchString =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    // enforce strict pagination window bounds
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // base query definition
    let query = db.select().from(items);

    if (searchString) {
      // leverage GIN index for ranked full-text search matching
      // if the query contains spaces, plainto_tsquery converts it to an AND seq
      query.where(
        sql`to_tsvector('english', ${items.name} || ' ' || ${items.description}) @@ plainto_tsquery('english', ${searchString})`,
      );

      // optionally order by match relevance rank
      query.orderBy(
        desc(
          sql`ts_rank(to_tsvector('english', ${items.name} || ' ' || ${items.description}), plainto_tsquery('english', ${searchString}))`,
        ),
      );
    } else {
      // fallback to alphabetical sorting when no query present
      query.orderBy(items.name);
    }

    // apply strict chunking windows
    const results = await query.limit(limit).offset(offset);

    return res.status(200).json({
      items: results,
      meta: {
        count: results.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
