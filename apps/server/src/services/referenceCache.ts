import { db } from "@project/database";
import {
  backgrounds,
  backgroundTraits,
  classes,
  classLevels,
  classMulticlassTraits,
  classProgressions,
  races,
  raceTraits,
  subclasses,
  subraces,
  subraceTraits,
  subclassProgressions,
  traits,
} from "@project/database/src/schema/reference.js";
import { and, eq } from "drizzle-orm";

// #region Type Definitions

type RaceRow = typeof races.$inferSelect;
type SubraceRow = typeof subraces.$inferSelect;
type TraitRow = typeof traits.$inferSelect;
type ClassRow = typeof classes.$inferSelect;
type SubclassRow = typeof subclasses.$inferSelect;
type ClassLevelRow = typeof classLevels.$inferSelect;
type BackgroundRow = typeof backgrounds.$inferSelect;

/**
 * Represents a snapshot of the reference cache, containing all relevant reference data and their relationships.
 */
export type ReferenceCacheSnapshot = {
  version: number;
  loadedAt: number;
  races: RaceRow[];
  classes: ClassRow[];
  backgrounds: BackgroundRow[];
  traits: TraitRow[];
  subracesByRaceId: Map<string, SubraceRow[]>;
  raceTraitsByRaceId: Map<string, TraitRow[]>;
  subraceTraitsBySubraceId: Map<string, TraitRow[]>;
  subclassesByClassId: Map<string, SubclassRow[]>;
  subclassById: Map<string, SubclassRow>;
  classLevelsByClassId: Map<string, ClassLevelRow[]>;
  multiclassTraitsByClassId: Map<string, TraitRow[]>;
  classTraitsByClassLevel: Map<string, TraitRow[]>;
  subclassTraitsBySubclassLevel: Map<string, TraitRow[]>;
  backgroundTraitsByBackgroundId: Map<string, TraitRow[]>;
  traitsById: Map<string, TraitRow>;
};

// #endregion

// #region Reference Cache Implementation

/**
 * The current version of the reference cache. This number is incremented each time the cache is invalidated.
 */
let cacheVersion = 0;
/**
 * The current snapshot of the reference cache. This is null if the cache has not been built yet or has been invalidated.
 */
let snapshot: ReferenceCacheSnapshot | null = null;
/**
 * A promise that represents the ongoing process of building the reference cache.
 * If the cache is already being built, this promise will be used to wait for the build to complete.
 */
let warmingPromise: Promise<ReferenceCacheSnapshot> | null = null;

/**
 * Generates a unique key for a class and level combination, used for mapping traits to specific class levels.
 * @param classId The ID of the class.
 * @param level The level of the class.
 * @returns A string key in the format "classId::level" that uniquely identifies the class and level combination.
 */
const classLevelKey = (classId: string, level: number): string =>
  `${classId}::${level}`;

/**
 * Generates a unique key for a subclass and level combination, used for mapping traits to specific subclass levels.
 * @param subclassId The ID of the subclass.
 * @param level The level of the subclass.
 * @returns A string key in the format "subclassId::level" that uniquely identifies the subclass and level combination.
 */
const subclassLevelKey = (subclassId: string, level: number): string =>
  `${subclassId}::${level}`;

/**
 * Pushes a value into an array stored in a map under a specific key. If the key does not exist, it initializes the array with the value.
 * @param map The map to push the value into.
 * @param key The key under which the value should be stored.
 * @param value The value to be pushed into the array.
 * @returns void
 */
const pushMapArray = <T>(
  map: Map<string, T[]>,
  key: string,
  value: T,
): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
};

/**
 * Sorts an array of objects by their "level" property in ascending order.
 * @param rows The array of objects to be sorted, each object must have a "level" property of type number.
 * @returns A new array sorted by the "level" property in ascending order.
 */
const sortByLevel = <T extends { level: number }>(rows: T[]): T[] =>
  rows.sort((a, b) => a.level - b.level);

/**
 * Builds the reference cache by fetching all relevant reference data from the database and organizing it into a structured snapshot.
 * @returns A promise that resolves to the newly built reference cache snapshot.
 */
const buildReferenceCache = async (): Promise<ReferenceCacheSnapshot> => {
  // #region Fetch Data

  // fetch all relevant reference data from the database in parallel
  const [
    allRaces,
    allSubraces,
    allClasses,
    allSubclasses,
    allClassLevels,
    allBackgrounds,
    allTraits,
    raceTraitLinks,
    subraceTraitLinks,
    backgroundTraitLinks,
    classTraitLinks,
    multiclassTraitLinks,
    subclassTraitLinks,
  ] = await Promise.all([
    db
      .select()
      .from(races)
      .where(and(eq(races.sourceType, "core"), eq(races.isPublished, true))),
    db
      .select()
      .from(subraces)
      .where(
        and(eq(subraces.sourceType, "core"), eq(subraces.isPublished, true)),
      ),
    db
      .select()
      .from(classes)
      .where(
        and(eq(classes.sourceType, "core"), eq(classes.isPublished, true)),
      ),
    db
      .select()
      .from(subclasses)
      .where(
        and(
          eq(subclasses.sourceType, "core"),
          eq(subclasses.isPublished, true),
        ),
      ),
    db.select().from(classLevels),
    db
      .select()
      .from(backgrounds)
      .where(
        and(
          eq(backgrounds.sourceType, "core"),
          eq(backgrounds.isPublished, true),
        ),
      ),
    db
      .select()
      .from(traits)
      .where(and(eq(traits.sourceType, "core"), eq(traits.isPublished, true))),
    db
      .select({ raceId: raceTraits.raceId, trait: traits })
      .from(raceTraits)
      .innerJoin(traits, eq(raceTraits.traitId, traits.id)),
    db
      .select({ subraceId: subraceTraits.subraceId, trait: traits })
      .from(subraceTraits)
      .innerJoin(traits, eq(subraceTraits.traitId, traits.id)),
    db
      .select({ backgroundId: backgroundTraits.backgroundId, trait: traits })
      .from(backgroundTraits)
      .innerJoin(traits, eq(backgroundTraits.traitId, traits.id)),
    db
      .select({
        classId: classProgressions.classId,
        level: classProgressions.level,
        trait: traits,
      })
      .from(classProgressions)
      .innerJoin(
        traits,
        and(
          eq(classProgressions.traitId, traits.id),
          eq(traits.sourceType, "core"),
          eq(traits.isPublished, true),
        ),
      )
      .where(
        and(
          eq(classProgressions.sourceType, "core"),
          eq(classProgressions.isPublished, true),
        ),
      ),
    db
      .select({ classId: classMulticlassTraits.classId, trait: traits })
      .from(classMulticlassTraits)
      .innerJoin(
        traits,
        and(
          eq(classMulticlassTraits.traitId, traits.id),
          eq(traits.sourceType, "core"),
          eq(traits.isPublished, true),
        ),
      ),
    db
      .select({
        subclassId: subclassProgressions.subclassId,
        level: subclassProgressions.level,
        trait: traits,
      })
      .from(subclassProgressions)
      .innerJoin(
        traits,
        and(
          eq(subclassProgressions.traitId, traits.id),
          eq(traits.sourceType, "core"),
          eq(traits.isPublished, true),
        ),
      )
      .where(
        and(
          eq(subclassProgressions.sourceType, "core"),
          eq(subclassProgressions.isPublished, true),
        ),
      ),
  ]);

  // #endregion

  // Increment the cache version for this new snapshot
  const nextVersion = ++cacheVersion;

  // #region Map Data Organization

  // organize the fetched data into maps for efficient access
  const subracesByRaceId = new Map<string, SubraceRow[]>();
  for (const subrace of allSubraces) {
    pushMapArray(subracesByRaceId, subrace.parentRaceId, subrace);
  }

  const raceTraitsByRaceId = new Map<string, TraitRow[]>();
  for (const row of raceTraitLinks) {
    pushMapArray(raceTraitsByRaceId, row.raceId, row.trait);
  }

  const subraceTraitsBySubraceId = new Map<string, TraitRow[]>();
  for (const row of subraceTraitLinks) {
    pushMapArray(subraceTraitsBySubraceId, row.subraceId, row.trait);
  }

  const subclassesByClassId = new Map<string, SubclassRow[]>();
  const subclassById = new Map<string, SubclassRow>();
  for (const subclass of allSubclasses) {
    pushMapArray(subclassesByClassId, subclass.parentClassId, subclass);
    subclassById.set(subclass.id, subclass);
  }

  const classLevelsByClassId = new Map<string, ClassLevelRow[]>();
  for (const row of allClassLevels) {
    pushMapArray(classLevelsByClassId, row.classId, row);
  }
  for (const rows of classLevelsByClassId.values()) {
    sortByLevel(rows);
  }

  const classTraitsByClassLevel = new Map<string, TraitRow[]>();
  for (const row of classTraitLinks) {
    pushMapArray(
      classTraitsByClassLevel,
      classLevelKey(row.classId, row.level),
      row.trait,
    );
  }

  const multiclassTraitsByClassId = new Map<string, TraitRow[]>();
  for (const row of multiclassTraitLinks) {
    pushMapArray(multiclassTraitsByClassId, row.classId, row.trait);
  }

  const subclassTraitsBySubclassLevel = new Map<string, TraitRow[]>();
  for (const row of subclassTraitLinks) {
    pushMapArray(
      subclassTraitsBySubclassLevel,
      subclassLevelKey(row.subclassId, row.level),
      row.trait,
    );
  }

  const backgroundTraitsByBackgroundId = new Map<string, TraitRow[]>();
  for (const row of backgroundTraitLinks) {
    pushMapArray(backgroundTraitsByBackgroundId, row.backgroundId, row.trait);
  }

  const traitsById = new Map<string, TraitRow>(
    allTraits.map((trait) => [trait.id, trait]),
  );

  // #endregion

  // #region Return Snapshot

  return {
    version: nextVersion,
    loadedAt: Date.now(),
    races: allRaces,
    classes: allClasses,
    backgrounds: allBackgrounds,
    traits: allTraits,
    subracesByRaceId,
    raceTraitsByRaceId,
    subraceTraitsBySubraceId,
    subclassesByClassId,
    subclassById,
    classLevelsByClassId,
    multiclassTraitsByClassId,
    classTraitsByClassLevel,
    subclassTraitsBySubclassLevel,
    backgroundTraitsByBackgroundId,
    traitsById,
  };

  // #endregion
};

/**
 * Returns the current reference cache snapshot, building it if necessary.
 * If the cache is already being built, it waits for the build to complete and returns the result.
 * @returns The current reference cache snapshot.
 */
export const getReferenceCache = async (): Promise<ReferenceCacheSnapshot> => {
  // If a snapshot already exists, return it immediately
  if (snapshot) return snapshot;

  // If a build is already in progress, wait for it to complete and return the result
  if (!warmingPromise) {
    warmingPromise = buildReferenceCache()
      .then((built) => {
        snapshot = built;
        return built;
      })
      .finally(() => {
        warmingPromise = null;
      });
  }

  return warmingPromise;
};

export const warmReferenceCache = async (
  force = false,
): Promise<ReferenceCacheSnapshot> => {
  if (force) {
    snapshot = null;
  }
  return getReferenceCache();
};

/**
 * Invalidates the reference cache, forcing it to be rebuilt on the next access.
 * @returns The new cache version number after invalidation.
 */
export const invalidateReferenceCache = (): number => {
  snapshot = null;
  cacheVersion += 1;
  return cacheVersion;
};

/**
 * Returns the current version of the reference cache.
 * If the cache has not been built yet, it returns the last known version number.
 * @returns The current version number of the reference cache.
 */
export const getReferenceCacheVersion = (): number =>
  snapshot?.version ?? cacheVersion;

export const getClassGrantedTraitIdsAtLevel = async (
  classId: string,
  level: number,
): Promise<string[]> => {
  const cache = await getReferenceCache();
  const traitsAtLevel = cache.classTraitsByClassLevel.get(
    classLevelKey(classId, level),
  );
  if (traitsAtLevel) {
    return traitsAtLevel.map((trait) => trait.id);
  }

  const rows = await db
    .select({ traitId: classProgressions.traitId })
    .from(classProgressions)
    .where(
      and(
        eq(classProgressions.classId, classId),
        eq(classProgressions.level, level),
      ),
    );

  return rows.map((row) => row.traitId);
};

// #endregion
