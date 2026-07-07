import { db } from "@project/database";
import {
  backgrounds,
  backgroundTraits,
  classes,
  classLevels,
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

type RaceRow = typeof races.$inferSelect;
type SubraceRow = typeof subraces.$inferSelect;
type TraitRow = typeof traits.$inferSelect;
type ClassRow = typeof classes.$inferSelect;
type SubclassRow = typeof subclasses.$inferSelect;
type ClassLevelRow = typeof classLevels.$inferSelect;
type BackgroundRow = typeof backgrounds.$inferSelect;

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
  classTraitsByClassLevel: Map<string, TraitRow[]>;
  subclassTraitsBySubclassLevel: Map<string, TraitRow[]>;
  backgroundTraitsByBackgroundId: Map<string, TraitRow[]>;
  traitsById: Map<string, TraitRow>;
};

let cacheVersion = 0;
let snapshot: ReferenceCacheSnapshot | null = null;
let warmingPromise: Promise<ReferenceCacheSnapshot> | null = null;

const classLevelKey = (classId: string, level: number): string =>
  `${classId}::${level}`;
const subclassLevelKey = (subclassId: string, level: number): string =>
  `${subclassId}::${level}`;

const pushMapArray = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
};

const sortByLevel = <T extends { level: number }>(rows: T[]): T[] =>
  rows.sort((a, b) => a.level - b.level);

const buildReferenceCache = async (): Promise<ReferenceCacheSnapshot> => {
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
    subclassTraitLinks,
  ] = await Promise.all([
    db
      .select()
      .from(races)
      .where(and(eq(races.sourceType, "core"), eq(races.isPublished, true))),
    db
      .select()
      .from(subraces)
      .where(and(eq(subraces.sourceType, "core"), eq(subraces.isPublished, true))),
    db
      .select()
      .from(classes)
      .where(and(eq(classes.sourceType, "core"), eq(classes.isPublished, true))),
    db
      .select()
      .from(subclasses)
      .where(
        and(eq(subclasses.sourceType, "core"), eq(subclasses.isPublished, true)),
      ),
    db.select().from(classLevels),
    db
      .select()
      .from(backgrounds)
      .where(
        and(eq(backgrounds.sourceType, "core"), eq(backgrounds.isPublished, true)),
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

  const nextVersion = ++cacheVersion;

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
    classTraitsByClassLevel,
    subclassTraitsBySubclassLevel,
    backgroundTraitsByBackgroundId,
    traitsById,
  };
};

export const getReferenceCache = async (): Promise<ReferenceCacheSnapshot> => {
  if (snapshot) return snapshot;

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

export const invalidateReferenceCache = (): number => {
  snapshot = null;
  cacheVersion += 1;
  return cacheVersion;
};

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
      and(eq(classProgressions.classId, classId), eq(classProgressions.level, level)),
    );

  return rows.map((row) => row.traitId);
};
