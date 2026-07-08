import { db } from "@project/database";
import { Router, type Router as ExpressRouter } from "express";
import { campaignMembers } from "@project/database/src/schema/operational.js";
import { traits } from "@project/database/src/schema/reference.js";
import { and, eq } from "drizzle-orm";
import {
  getEffectiveReferenceSnapshot,
  listEffectiveFeats,
  searchEffectiveItems,
} from "../services/effectiveReferenceResolver.js";
import {
  getReferenceCacheVersion,
  getReferenceCache,
} from "../services/referenceCache.js";

const router: ExpressRouter = Router();

type ScopedContext = {
  campaignId?: string;
  characterId?: string;
};

const getHeaderUserId = (req: {
  user?: { id?: string };
  headers: Record<string, unknown>;
}): string | undefined => {
  if (typeof req.user?.id === "string") return req.user.id;
  const testerHeader = req.headers["x-tester-id"];
  return typeof testerHeader === "string" ? testerHeader : undefined;
};

const requireScopedAccessIfPresent = async (
  req: {
    query: Record<string, unknown>;
    user?: { id?: string };
    headers: Record<string, unknown>;
  },
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
  },
): Promise<{ ok: true; scope: ScopedContext } | { ok: false }> => {
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId =
    typeof req.query.characterId === "string"
      ? req.query.characterId
      : undefined;

  if (!campaignId && characterId) {
    res.status(400).json({
      error: "characterId scoped reads require campaignId context.",
    });
    return { ok: false };
  }

  if (!campaignId) return { ok: true, scope: {} };

  const userId = getHeaderUserId(req);
  if (!userId) {
    res.status(401).json({ error: "campaignId scoped reads require auth." });
    return { ok: false };
  }

  const [membership] = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    res.status(403).json({ error: "Forbidden campaign access." });
    return { ok: false };
  }

  return {
    ok: true,
    scope: characterId ? { campaignId, characterId } : { campaignId },
  };
};

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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const payload = cache.races.map((race) => {
      const baseTraits = (cache.raceTraitsByRaceId.get(race.id) ?? []).map(
        (trait) => ({ ...trait, sourceOrigin: `Race: ${race.name}` }),
      );
      const associatedSubraces = (
        cache.subracesByRaceId.get(race.id) ?? []
      ).map((subrace) => {
        const subTraits = (
          cache.subraceTraitsBySubraceId.get(subrace.id) ?? []
        ).map((trait) => ({
          ...trait,
          sourceOrigin: `Subrace: ${subrace.name}`,
        }));

        return {
          ...subrace,
          traits: subTraits,
        };
      });

      return { ...race, traits: baseTraits, subraces: associatedSubraces };
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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    return res.status(200).json({ classes: cache.classes });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/feats
 * Returns feats resolved through the scoped 3-layer authority model.
 */
router.get("/feats", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const effectiveFeats = await listEffectiveFeats(scoped.scope);
    return res.status(200).json({ feats: effectiveFeats });
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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const validSubclasses = cache.subclassesByClassId.get(classId) ?? [];

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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const classId = req.params.id;
    const requestedSubclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;

    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const levels = cache.classLevelsByClassId.get(classId) ?? [];
    const levelMetaByLevel = new Map(levels.map((row) => [row.level, row]));

    let subclassGrantedFeatures: Array<{ level: number; trait: any }> = [];
    if (requestedSubclassId) {
      const validSubclass = cache.subclassById.get(requestedSubclassId);
      const isValidSubclass = validSubclass?.parentClassId === classId;

      if (validSubclass && isValidSubclass) {
        subclassGrantedFeatures = Array.from({ length: 20 }, (_, i) => i + 1)
          .flatMap((level) =>
            (
              cache.subclassTraitsBySubclassLevel.get(
                `${requestedSubclassId}::${level}`,
              ) ?? []
            ).map((trait) => ({
              level,
              trait: {
                ...trait,
                sourceOrigin: `Subclass: ${validSubclass.name}`,
              },
            })),
          )
          .map((row) => ({
            level: row.level,
            trait: row.trait,
          }));
      }
    }

    const classFeaturesByLevel = new Map<
      number,
      Array<typeof traits.$inferSelect>
    >(
      Array.from({ length: 20 }, (_, i) => i + 1).map((level) => [
        level,
        cache.classTraitsByClassLevel.get(`${classId}::${level}`) ?? [],
      ]),
    );

    const subclassFeaturesByLevel = new Map<
      number,
      Array<typeof traits.$inferSelect>
    >(
      Array.from({ length: 20 }, (_, i) => i + 1).map((level) => [
        level,
        subclassGrantedFeatures
          .filter((feature) => feature.level === level)
          .map((feature) => feature.trait),
      ]),
    );

    const timeline = Array.from({ length: 20 }, (_, i) => {
      const currentLevel = i + 1;
      const levelMeta = levelMetaByLevel.get(currentLevel);
      const classFeaturesAtLevel = classFeaturesByLevel.get(currentLevel) ?? [];
      const subclassFeaturesAtLevel =
        subclassFeaturesByLevel.get(currentLevel) ?? [];
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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);

    const payload = cache.backgrounds.map((background) => {
      const grantedTraits = (
        cache.backgroundTraitsByBackgroundId.get(background.id) ?? []
      ).map((trait) => ({
        ...trait,
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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const allTraits = cache.traits;

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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const traitId = req.params.id;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const trait = cache.traitsById.get(traitId);

    if (!trait) {
      return res.status(404).json({ error: "Reference data not found" });
    }

    return res.status(200).json({ trait });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reference/version
 * Exposes current server-side reference cache version for client invalidation strategies.
 */
router.get("/version", async (_req, res, next) => {
  try {
    const cache = await getReferenceCache();
    return res.status(200).json({
      version: getReferenceCacheVersion(),
      loadedAt: cache.loadedAt,
    });
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
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const searchString =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    // enforce strict pagination window bounds
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const { rows: results, total } = await searchEffectiveItems({
      scope: scoped.scope,
      query: searchString,
      limit,
      offset,
    });

    return res.status(200).json({
      items: results,
      meta: {
        count: total,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
