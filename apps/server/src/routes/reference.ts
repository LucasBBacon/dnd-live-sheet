import { db } from "@project/database";
import { Router, type Router as ExpressRouter } from "express";
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
import { traits } from "@project/database/src/schema/reference.js";
import { and, eq } from "drizzle-orm";
import {
  getEffectiveReferenceSnapshot,
  listEffectiveFeats,
  searchEffectiveItems,
} from "../services/effectiveReferenceResolver.js";
import {
  assessMulticlassPrerequisitesFromSnapshot,
  resolveNextLevelValidationContextFromSnapshot,
} from "../services/levelUpValidation.js";
import {
  getReferenceCacheVersion,
  getReferenceCache,
} from "../services/referenceCache.js";
import { getCachedRuleSnapshot } from "../services/ruleSnapshotCache.js";
import {
  getHeaderOrAuthUserId,
  isUserCampaignMember,
} from "../services/campaignAccess.js";

const router: ExpressRouter = Router();

type ScopedContext = {
  campaignId?: string;
  characterId?: string;
};

// #region Helper Functions

/**
 * Requires scoped access for the request if a campaignId is present.
 * @param req The incoming request object containing query parameters, headers, and user information.
 * @param res The response object used to send HTTP responses.
 * @returns An object indicating whether access is granted and the scoped context if applicable.
 */
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
  // Extract campaignId and characterId from query parameters
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId =
    typeof req.query.characterId === "string"
      ? req.query.characterId
      : undefined;

  // If characterId is provided without campaignId, return a 400 error
  if (!campaignId && characterId) {
    res.status(400).json({
      error: "characterId scoped reads require campaignId context.",
    });
    return { ok: false };
  }

  // If neither campaignId nor characterId is provided, return an empty scope
  if (!campaignId) return { ok: true, scope: {} };

  // If campaignId is provided, check for user authentication
  // If the user is not authenticated, return a 401 error
  const userId = getHeaderOrAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "campaignId scoped reads require auth." });
    return { ok: false };
  }

  const hasAccess = await isUserCampaignMember(userId, campaignId);
  if (!hasAccess) {
    res.status(403).json({ error: "Forbidden campaign access." });
    return { ok: false };
  }

  // If all checks pass, return the scoped context with campaignId and characterId (if provided)
  return {
    ok: true,
    scope: characterId ? { campaignId, characterId } : { campaignId },
  };
};

type TraitEffectLike = {
  type?: string;
  category?: string;
};

type GrantSourceType =
  | "multiclass_grant"
  | "class_progression"
  | "subclass_progression";

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

/**
 * Determines if a given trait matches a specified category (skills or tools_and_languages).
 * @param trait An object representing the trait, containing its ID, name, and effects.
 * @param category The category to match against, either "skills" or "tools_and_languages".
 * @returns A boolean indicating whether the trait matches the specified category.
 */
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
 * Builds a class timeline for a given class and optional subclass, resolving features granted at each level.
 * @param param0 An object containing the effective reference snapshot, class ID, and optional requested subclass ID.
 * @returns An array representing the class timeline, with each entry containing the level, scaling, spellcasting progression, and features granted at that level.
 */
const buildClassTimeline = ({
  cache,
  classId,
  requestedSubclassId,
}: {
  cache: Awaited<ReturnType<typeof getEffectiveReferenceSnapshot>>;
  classId: string;
  requestedSubclassId: string | undefined;
}) => {
  // retrieve class levels for the specified class ID from cache, default to empty array if not found
  // create a map of level metadata for quick access by level
  const levels = cache.classLevelsByClassId.get(classId) ?? [];
  const levelMetaByLevel = new Map(levels.map((row) => [row.level, row]));

  let subclassGrantedFeatures: Array<{
    level: number;
    trait: typeof traits.$inferSelect;
  }> = [];

  // if a requested subclass ID is provided, validate it against cache and check if it belongs to specified class
  if (requestedSubclassId) {
    const validSubclass = cache.subclassById.get(requestedSubclassId);
    const isValidSubclass = validSubclass?.parentClassId === classId;

    // if the subclass is valid,
    // build list of granted features for each level (1-20) by retrieving traits from cache
    // annotate with source origin
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

  // build maps of class features and subclass features by level for quick access
  const classFeaturesByLevel = new Map<
    number,
    Array<typeof traits.$inferSelect>
  >(
    Array.from({ length: 20 }, (_, i) => i + 1).map((level) => [
      level,
      cache.classTraitsByClassLevel.get(`${classId}::${level}`) ?? [],
    ]),
  );

  // build maps of subclass features by level for quick access, filtering granted features by level
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

  // return an array representing the class timeline
  // each entry contains the level, scaling, spellcasting progression, and features granted at that level
  return Array.from({ length: 20 }, (_, i) => {
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
};

/**
 * Builds the next level context for a character's class progression, including the target level and granted traits at that level.
 * @param param0 An object containing the effective reference snapshot, class ID, current class level, and optional requested subclass ID.
 * @returns An object representing the next level context, including the target level and an array of granted trait IDs at that level.
 */
const buildNextLevelContext = ({
  cache,
  classId,
  currentClassLevel,
  requestedSubclassId,
  isMulticlassDip,
}: {
  cache: Awaited<ReturnType<typeof getEffectiveReferenceSnapshot>>;
  classId: string;
  currentClassLevel: number;
  requestedSubclassId: string | undefined;
  isMulticlassDip: boolean;
}) => {
  // resolve the next level context from the effective reference snapshot
  const nextLevelContext = resolveNextLevelValidationContextFromSnapshot({
    cache,
    classId,
    currentClassLevel,
    isMulticlassDip,
    ...(requestedSubclassId !== undefined ? { requestedSubclassId } : {}),
  });

  // if next level context is not configured, return it
  if (!nextLevelContext.isConfigured) {
    return nextLevelContext;
  }

  const grantedTraitIds = nextLevelContext.grantedTraitIds;
  const validSubclass = requestedSubclassId
    ? cache.subclassById.get(requestedSubclassId)
    : undefined;
  const isValidSubclass = validSubclass?.parentClassId === classId;
  const targetLevel = nextLevelContext.targetLevel;

  const classTraitIdsAtTargetLevel = new Set(
    (cache.classTraitsByClassLevel.get(`${classId}::${targetLevel}`) ?? []).map(
      (trait) => trait.id,
    ),
  );

  const subclassTraitIdsAtTargetLevel = new Set(
    isValidSubclass
      ? (
          cache.subclassTraitsBySubclassLevel.get(
            `${requestedSubclassId}::${targetLevel}`,
          ) ?? []
        ).map((trait) => trait.id)
      : [],
  );

  const grantedTraits = grantedTraitIds.map((traitId) => {
    let grantSourceType: GrantSourceType = "class_progression";

    if (isMulticlassDip && targetLevel === 1) {
      grantSourceType = "multiclass_grant";
    } else if (subclassTraitIdsAtTargetLevel.has(traitId)) {
      grantSourceType = "subclass_progression";
    } else if (classTraitIdsAtTargetLevel.has(traitId)) {
      grantSourceType = "class_progression";
    }

    return {
      id: traitId,
      name:
        cache.traitsById.get(traitId)?.name ??
        traitId.replace(/_/g, " ").toUpperCase(),
      grantSourceType,
    };
  });

  return {
    ...nextLevelContext,
    grantedTraitIds,
    grantedTraits,
  };
};

/**
 * Loads the character's class levels based on the provided characterId and campaignId.
 * @param param0 An object containing characterId and campaignId.
 * @returns A promise that resolves to a record mapping class IDs to their corresponding class levels for the specified character.
 */
const loadCharacterClassLevels = async ({
  characterId,
  campaignId,
}: {
  characterId: string | undefined;
  campaignId: string | undefined;
}): Promise<Record<string, number>> => {
  if (!characterId) {
    return {};
  }

  const characterScopeFilter = campaignId
    ? and(eq(characters.id, characterId), eq(characters.campaignId, campaignId))
    : eq(characters.id, characterId);

  const [character] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(characterScopeFilter)
    .limit(1);

  if (!character) {
    return {};
  }

  const classRows = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId));

  return Object.fromEntries(
    classRows.map((row) => [row.classId, row.classLevel]),
  );
};

const loadCharacterBaseScores = async ({
  characterId,
  campaignId,
}: {
  characterId: string | undefined;
  campaignId: string | undefined;
}): Promise<{
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
} | null> => {
  if (!characterId) {
    return null;
  }

  const characterScopeFilter = campaignId
    ? and(eq(characters.id, characterId), eq(characters.campaignId, campaignId))
    : eq(characters.id, characterId);

  const [character] = await db
    .select({
      str: characters.str,
      dex: characters.dex,
      con: characters.con,
      int: characters.int,
      wis: characters.wis,
      cha: characters.cha,
    })
    .from(characters)
    .where(characterScopeFilter)
    .limit(1);

  return character ?? null;
};

// #endregion

// #region GET /api/reference/races

/**
 * GET /api/reference/races
 *
 * Returns all races. If `requiresSubrace` is true, the `subraces` array will be populated.
 */
router.get("/races", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in the request
    // if access not granted, response has already been sent with an error status
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    // fetch effective reference snapshot based on scoped context
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);

    // map over races in cache to build response payload
    // include base traits and associated subraces with their traits
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

      // return race obj with base traits and associated subraces
      return { ...race, traits: baseTraits, subraces: associatedSubraces };
    });

    // send the response with the constructed payload
    return res.status(200).json({ races: payload });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /api/reference/classes

/**
 * GET /api/reference/classes
 *
 * Returns all classes with their associated subclasses and traits resolved through the scoped 3-layer authority model.
 */
router.get("/classes", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in the request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    // fetch effective reference snapshot based on scoped context, and return the classes from the cache
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    return res.status(200).json({ classes: cache.classes });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /api/reference/feats

/**
 * GET /api/reference/feats
 *
 * Returns feats resolved through the scoped 3-layer authority model.
 */
router.get("/feats", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in the request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    // fetch effective feats based on scoped context, and return the feats in the response
    const effectiveFeats = await listEffectiveFeats(scoped.scope);
    return res.status(200).json({ feats: effectiveFeats });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /api/reference/level-up/options

/**
 * GET /api/reference/level-up/options
 *
 * Consolidated level-up payload for wizard steps.
 */
router.get("/level-up/options", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in the request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    // extract query params for classId, subclassId, and currentClassLevel
    const classId =
      typeof req.query.classId === "string" ? req.query.classId : undefined;
    const subclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;
    const currentClassLevelRaw =
      typeof req.query.currentClassLevel === "string"
        ? Number.parseInt(req.query.currentClassLevel, 10)
        : 0;
    const currentClassLevel = Number.isFinite(currentClassLevelRaw)
      ? Math.max(0, currentClassLevelRaw)
      : 0;

    // if subclassId and no classId, return a 400 error
    if (!classId && subclassId) {
      return res.status(400).json({
        error: "subclassId requires classId context.",
      });
    }

    // fetch the effective reference snapshot, effective feats, and character class levels based on scoped context
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const feats = await listEffectiveFeats(scoped.scope);
    const classLevelsByClassId = await loadCharacterClassLevels({
      characterId: scoped.scope.characterId,
      campaignId: scoped.scope.campaignId,
    });
    const currentBaseScores = await loadCharacterBaseScores({
      characterId: scoped.scope.characterId,
      campaignId: scoped.scope.campaignId,
    });

    // determine valid subclasses for classId
    const subclasses = classId
      ? (cache.subclassesByClassId.get(classId) ?? [])
      : [];

    // build class timeline
    const timeline = classId
      ? buildClassTimeline({
          cache,
          classId,
          requestedSubclassId: subclassId,
        })
      : [];

    // build next level context
    const selectedClassCurrentLevel = classId
      ? (classLevelsByClassId[classId] ?? currentClassLevel)
      : currentClassLevel;
    const selectedClassIsDip = classId
      ? (classLevelsByClassId[classId] ?? 0) === 0 &&
        Object.keys(classLevelsByClassId).length > 0
      : false;

    const nextLevel = classId
      ? buildNextLevelContext({
          cache,
          classId,
          currentClassLevel: selectedClassCurrentLevel,
          requestedSubclassId: subclassId,
          isMulticlassDip: selectedClassIsDip,
        })
      : null;

    // build supportByClass mapping for all classes in cache
    const supportByClass = Object.fromEntries(
      cache.classes.map((cls) => {
        const clsCurrentLevel = classLevelsByClassId[cls.id] ?? 0;
        const isMulticlassDip =
          clsCurrentLevel === 0 && Object.keys(classLevelsByClassId).length > 0;
        const support = buildNextLevelContext({
          cache,
          classId: cls.id,
          currentClassLevel: clsCurrentLevel,
          requestedSubclassId: undefined,
          isMulticlassDip,
        });

        const multiclassPreview =
          isMulticlassDip && currentBaseScores
            ? assessMulticlassPrerequisitesFromSnapshot({
                cache,
                classId: cls.id,
                currentBaseScores,
              })
            : null;

        return [
          cls.id,
          {
            ...support,
            multiclassPrerequisitesMet:
              multiclassPreview?.meetsPrerequisites ?? null,
            multiclassPrerequisiteReason: multiclassPreview?.reason ?? null,
          },
        ] as const;
      }),
    );

    // return the consolidated level-up options payload in res
    return res.status(200).json({
      classes: cache.classes,
      feats,
      subclasses,
      timeline,
      nextLevel,
      supportByClass,
      selected: {
        classId: classId ?? null,
        subclassId: subclassId ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /classes/:id/subclasses

/**
 * GET /api/reference/classes/:id/subclasses
 *
 * Fetches the valid subclasses for a specific base class.
 */
router.get("/classes/:id/subclasses", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in the request
    const classId = req.params.id;
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    // fetch the effective reference snapshot based on scoped context, and retrieve valid subclasses for the specified classId
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const validSubclasses = cache.subclassesByClassId.get(classId) ?? [];

    return res.status(200).json({ subclasses: validSubclasses });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /classes/:id/timeline

/**
 * GET /api/reference/classes/:id/timeline
 *
 * Builds on the 1-to-20 progression array, merging class levels and granted traits
 */
router.get("/classes/:id/timeline", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const classId = req.params.id;
    // extract optional subclassId from query parameters
    const requestedSubclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;

    // fetch effective reference snapshot based on scoped context
    // build class timeline for classId and optional requestedSubclassId
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const timeline = buildClassTimeline({
      cache,
      classId,
      requestedSubclassId,
    });

    return res.status(200).json({ timeline });
  } catch (error) {
    next(error);
  }
});

// #endregion

// region GET /api/reference/backgrounds

/**
 * GET /api/reference/backgrounds
 *
 * Returns all backgrounds with fully resolved granted trait records.
 */
router.get("/backgrounds", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);

    // map over backgrounds in cache to build response payload
    // include granted traits for each background, annotated with source origin
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

// #endregion

// #region GET /api/reference/traits
/**
 * GET /api/reference/traits
 *
 * Returns all traits, optionally filtered by category (skills or tools_and_languages).
 * Query params:
 * - category=skills | tools_and_languages
 */
router.get("/traits", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    // extract optional category query parameter for filtering traits
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const allTraits = cache.traits;

    if (!category) {
      return res.status(200).json({ traits: allTraits });
    }

    // validate category query parameter, returning 400 error for invalid values
    if (category !== "skills" && category !== "tools_and_languages") {
      return res.status(400).json({
        error: "Invalid trait category. Use 'skills' or 'tools_and_languages'.",
      });
    }

    // filter traits based on specified category using matchesTraitCategory helper function
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

// #endregion

// #region GET /api/reference/traits/:id

/**
 * GET /api/reference/traits/:id
 *
 * Dedicated trait lookup for in-game Compendium modal.
 */
router.get("/traits/:id", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const traitId = req.params.id;
    const cache = await getEffectiveReferenceSnapshot(scoped.scope);
    const trait = cache.traitsById.get(traitId);

    // if trait is not found in cache, return a 404 error
    if (!trait) {
      return res.status(404).json({ error: "Reference data not found" });
    }

    return res.status(200).json({ trait });
  } catch (error) {
    next(error);
  }
});

// #endregion

// #region GET /api/reference/version

/**
 * GET /api/reference/version
 *
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

// #endregion

// #region GET /api/reference/items

/**
 * GET /api/reference/items
 *
 * Dedicated item lookup for in-game Compendium modal.
 * QUery Parameters:
 * - q: string (Search keywords)
 * - limit: number (Default 50, Max 100 for network safety)
 * - offset: number (For infinite scroll/pagination)
 */
router.get("/items", async (req, res, next) => {
  try {
    // check for scoped access based on campaignId and characterId in request
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;
    const searchString =
      typeof req.query.q === "string" ? req.query.q.trim() : "";

    // enforce strict pagination window bounds
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // search effective items based on scoped context, search string, limit, and offset
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

// #endregion

// #region GET /api/reference/rules/snapshot

/**
 * GET /api/reference/rules/snapshot
 *
 * Returns a transport-safe rules snapshot for engine and web consumers.
 */
router.get("/rules/snapshot", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const cachedSnapshot = await getCachedRuleSnapshot();

    return res.status(200).json({
      version: cachedSnapshot.cacheVersion,
      loadedAt: cachedSnapshot.loadedAt,
      snapshot: cachedSnapshot.snapshot,
    });
  } catch (error) {
    next(error);
  }
});

// #endregion

export default router;
