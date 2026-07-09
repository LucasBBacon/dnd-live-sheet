import { db } from "@project/database";
import {
  feats,
  items,
  traits,
} from "@project/database/src/schema/reference.js";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import {
  type ReferenceCacheSnapshot,
  getReferenceCache,
  getReferenceCacheVersion,
} from "./referenceCache.js";

// #region Type Definitions

type TraitRow = typeof traits.$inferSelect;
type FeatRow = typeof feats.$inferSelect;
type ItemRow = typeof items.$inferSelect;

/**
 * Defines the scope for resolving effective reference data, including optional campaign and character context.
 */
export type ReferenceScope = {
  campaignId?: string;
  characterId?: string;
};

/**
 * Defines a snapshot of effective reference data, which includes core data and any applicable homebrew modifications based on the provided scope.
 * This snapshot is derived from the reference cache and is tailored to the specific campaign and character context.
 */
export type EffectiveReferenceSnapshot = Omit<
  ReferenceCacheSnapshot,
  | "traits"
  | "traitsById"
  | "raceTraitsByRaceId"
  | "subraceTraitsBySubraceId"
  | "classTraitsByClassLevel"
  | "subclassTraitsBySubclassLevel"
  | "backgroundTraitsByBackgroundId"
> & {
  traits: TraitRow[];
  traitsById: Map<string, TraitRow>;
  raceTraitsByRaceId: Map<string, TraitRow[]>;
  subraceTraitsBySubraceId: Map<string, TraitRow[]>;
  classTraitsByClassLevel: Map<string, TraitRow[]>;
  subclassTraitsBySubclassLevel: Map<string, TraitRow[]>;
  backgroundTraitsByBackgroundId: Map<string, TraitRow[]>;
};

// #endregion

/**
 * A cache that stores effective reference snapshots for different scopes, keyed by a unique string representation of the scope.
 */
const scopedSnapshotCache = new Map<
  string,
  { version: number; snapshot: EffectiveReferenceSnapshot }
>();

/**
 * Generates a unique key for the given reference scope, combining campaign and character identifiers.
 * @param scope The reference scope containing campaign and character identifiers.
 * @returns A string key uniquely representing the given scope.
 */
const scopeKey = ({ campaignId, characterId }: ReferenceScope): string =>
  `${campaignId ?? "core"}::${characterId ?? "none"}`;

// #region Trait Helper Funcs

/**
 * Determines the precedence of a trait based on its source type and ownership, relative to the provided campaign and character context.
 * @param row The trait row to evaluate for precedence.
 * @param _scopeCampaignId The campaign ID from the reference scope, used to determine if the trait is relevant to the current campaign context.
 * @param scopeCharacterId The character ID from the reference scope, used to determine if the trait is relevant to the current character context.
 * @returns A numeric value representing the precedence of the trait, where lower values indicate higher precedence.
 */
const traitPrecedence = (
  row: TraitRow,
  _scopeCampaignId: string,
  scopeCharacterId?: string,
): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scopeCharacterId)
    return 2;
  return 1;
};

/**
 * Generates a canonical key for a trait, which is used to identify the trait in the effective reference snapshot.
 * If the trait supersedes another trait, the superseded trait's ID is used as the canonical key; otherwise, the trait's own ID is used.
 * @param row The trait row for which to generate the canonical key.
 * @returns A string representing the canonical key for the trait, either the superseded trait's ID or the trait's own ID.
 */
const canonicalTraitKey = (row: TraitRow): string => row.supersedesId ?? row.id;

/**
 * Creates a shallow copy of a map where each value is an array, ensuring that the arrays themselves are also copied.
 * @param source The source map to copy.
 * @returns A new map with the same keys and copied arrays as values.
 */
const copyMap = <T>(source: Map<string, T[]>): Map<string, T[]> =>
  new Map(Array.from(source.entries(), ([k, v]) => [k, [...v]]));

/**
 * Remaps the trait links in the source map to point to the effective traits in the traitByLookupId map.
 * @param source The source map containing trait links to be remapped.
 * @param traitByLookupId A map of effective traits keyed by their lookup ID, used to resolve the correct trait references.
 * @returns A new map with the same keys as the source map, but with trait links remapped to point to the effective traits in the traitByLookupId map.
 */
const remapTraitLinks = (
  source: Map<string, TraitRow[]>,
  traitByLookupId: Map<string, TraitRow>,
): Map<string, TraitRow[]> => {
  const next = new Map<string, TraitRow[]>();
  for (const [key, rows] of source.entries()) {
    const resolved = rows
      .map((row) => traitByLookupId.get(row.id) ?? row)
      .filter(
        (row, index, arr) =>
          arr.findIndex((item) => item.id === row.id) === index,
      );
    next.set(key, resolved);
  }
  return next;
};

// #endregion

// #region Snapshot Builder

/**
 * Builds an effective reference snapshot containing only the core data, without any homebrew modifications.
 * @param core The core reference cache snapshot to base the effective snapshot on.
 * @returns An effective reference snapshot containing only the core data.
 */
const buildCoreOnlySnapshot = (
  core: ReferenceCacheSnapshot,
): EffectiveReferenceSnapshot => ({
  ...core,
  traits: [...core.traits],
  traitsById: new Map(core.traitsById),
  raceTraitsByRaceId: copyMap(core.raceTraitsByRaceId),
  subraceTraitsBySubraceId: copyMap(core.subraceTraitsBySubraceId),
  classTraitsByClassLevel: copyMap(core.classTraitsByClassLevel),
  subclassTraitsBySubclassLevel: copyMap(core.subclassTraitsBySubclassLevel),
  backgroundTraitsByBackgroundId: copyMap(core.backgroundTraitsByBackgroundId),
});

/**
 * Returns a snapshot of the effective reference data for the given scope.
 * This includes core data and any applicable homebrew data based on the campaign and character context.
 * @param scope The scope defining the campaign and character context for resolving effective references.
 * @returns A promise that resolves to the effective reference snapshot for the given scope.
 */
export const getEffectiveReferenceSnapshot = async (
  scope: ReferenceScope,
): Promise<EffectiveReferenceSnapshot> => {
  // fetch the current version of the reference cache and scope key
  const version = getReferenceCacheVersion();
  const key = scopeKey(scope);
  // check if a cached snapshot exists for the given scope and version
  // if it does, return the cached snapshot
  const cached = scopedSnapshotCache.get(key);
  if (cached && cached.version === version) {
    return cached.snapshot;
  }

  // fetch the core reference cache snapshot
  const core = await getReferenceCache();
  // if the scope does not include a campaign ID, return a snapshot containing only the core data
  if (!scope.campaignId) {
    const next = buildCoreOnlySnapshot(core);
    scopedSnapshotCache.set(key, { version, snapshot: next });
    return next;
  }

  // fetch homebrew traits that are published and belong to the specified campaign and character (if provided)
  const homebrewTraits = await db
    .select()
    .from(traits)
    .where(
      and(
        eq(traits.sourceType, "homebrew"),
        eq(traits.isPublished, true),
        eq(traits.ownerCampaignId, scope.campaignId),
        scope.characterId
          ? or(
              eq(traits.ownerCharacterId, scope.characterId),
              sql`${traits.ownerCharacterId} IS NULL`,
            )
          : sql`${traits.ownerCharacterId} IS NULL`,
      ),
    );

  // create a map of effective traits by their canonical ID, starting with the core traits
  const effectiveByCanonicalId = new Map<string, TraitRow>(
    core.traits.map((row) => [row.id, row]),
  );

  // sort the homebrew traits by precedence and ID
  const orderedHomebrew = [...homebrewTraits].sort((a, b) => {
    const precedenceDiff =
      traitPrecedence(b, scope.campaignId!, scope.characterId) -
      traitPrecedence(a, scope.campaignId!, scope.characterId);
    if (precedenceDiff !== 0) return precedenceDiff;
    return a.id.localeCompare(b.id);
  });

  // merge homebrew traits into the effective traits map, respecting precedence
  for (const row of orderedHomebrew) {
    const canonicalId = canonicalTraitKey(row);
    const existing = effectiveByCanonicalId.get(canonicalId);

    // if there is no existing trait with the same canonical ID, add the homebrew trait
    if (!existing) {
      effectiveByCanonicalId.set(canonicalId, row);
      continue;
    }

    // if there is an existing trait, compare precedence and replace if the homebrew trait has higher precedence
    if (
      traitPrecedence(row, scope.campaignId, scope.characterId) >
      traitPrecedence(existing, scope.campaignId, scope.characterId)
    ) {
      effectiveByCanonicalId.set(canonicalId, row);
    }
  }

  // create a new map of traits by their ID, including both core and effective homebrew traits
  const traitsById = new Map<string, TraitRow>(core.traitsById);
  for (const [canonicalId, row] of effectiveByCanonicalId.entries()) {
    traitsById.set(canonicalId, row);
    traitsById.set(row.id, row);
  }

  // create a new effective reference snapshot that includes the core data and the resolved homebrew traits
  const scopedSnapshot: EffectiveReferenceSnapshot = {
    ...core,
    traits: Array.from(effectiveByCanonicalId.values()),
    traitsById,
    raceTraitsByRaceId: remapTraitLinks(core.raceTraitsByRaceId, traitsById),
    subraceTraitsBySubraceId: remapTraitLinks(
      core.subraceTraitsBySubraceId,
      traitsById,
    ),
    classTraitsByClassLevel: remapTraitLinks(
      core.classTraitsByClassLevel,
      traitsById,
    ),
    subclassTraitsBySubclassLevel: remapTraitLinks(
      core.subclassTraitsBySubclassLevel,
      traitsById,
    ),
    backgroundTraitsByBackgroundId: remapTraitLinks(
      core.backgroundTraitsByBackgroundId,
      traitsById,
    ),
  };

  // cache the effective snapshot for the given scope and version, and return it
  scopedSnapshotCache.set(key, { version, snapshot: scopedSnapshot });
  return scopedSnapshot;
};

// #endregion

// #region Item Helper Funcs

/**
 * Determines the precedence of an item based on its source type and ownership, relative to the provided reference scope.
 * @param row The item row to evaluate for precedence.
 * @param scope The reference scope containing campaign and character identifiers, used to determine if the item is relevant to the current context.
 * @returns A numeric value representing the precedence of the item, where lower values indicate higher precedence.
 */
const itemPrecedence = (row: ItemRow, scope: ReferenceScope): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scope.characterId)
    return 2;
  return 1;
};

/**
 * Generates a canonical key for an item, which is used to identify the item in the effective reference snapshot.
 * @param row The item row for which to generate the canonical key.
 * @returns A string representing the canonical key for the item, either the superseded item's ID or the item's own ID.
 */
const canonicalItemKey = (row: ItemRow): string => row.supersedesId ?? row.id;

// #endregion

// #region Feat Helper Funcs

/**
 * Determines the precedence of a feat based on its source type and ownership, relative to the provided reference scope.
 * @param row The feat row to evaluate for precedence.
 * @param scope The reference scope containing campaign and character identifiers, used to determine if the feat is relevant to the current context.
 * @returns A numeric value representing the precedence of the feat, where lower values indicate higher precedence.
 */
const featPrecedence = (row: FeatRow, scope: ReferenceScope): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scope.characterId)
    return 2;
  return 1;
};

/**
 * Generates a canonical key for a feat, which is used to identify the feat in the effective reference snapshot.
 * If the feat supersedes another feat, the superseded feat's ID is used as the canonical key; otherwise, the feat's own ID is used.
 * @param row The feat row for which to generate the canonical key.
 * @returns A string representing the canonical key for the feat, either the superseded feat's ID or the feat's own ID.
 */
const canonicalFeatKey = (row: FeatRow): string => row.supersedesId ?? row.id;

// #endregion

/**
 * Lists the effective feats available in the given reference scope, resolving any conflicts based on precedence rules.
 * @param scope The reference scope defining the campaign and character context for resolving effective feats.
 * @returns A promise that resolves to an array of effective feats available in the given scope, sorted by name.
 */
export const listEffectiveFeats = async (
  scope: ReferenceScope,
): Promise<FeatRow[]> => {
  // visibility filter based on the scope
  // includes core + homebrew feats that are published and relevant to campaign and character context
  const visibilityFilter = scope.campaignId
    ? or(
        and(eq(feats.sourceType, "core"), eq(feats.isPublished, true)),
        and(
          eq(feats.sourceType, "homebrew"),
          eq(feats.isPublished, true),
          eq(feats.ownerCampaignId, scope.campaignId),
          scope.characterId
            ? or(
                eq(feats.ownerCharacterId, scope.characterId),
                sql`${feats.ownerCharacterId} IS NULL`,
              )
            : sql`${feats.ownerCharacterId} IS NULL`,
        ),
      )
    : and(eq(feats.sourceType, "core"), eq(feats.isPublished, true));

  // fetch all candidate feats based on visibility filter, order by name
  const candidates = await db
    .select()
    .from(feats)
    .where(visibilityFilter)
    .orderBy(asc(feats.name));

  // deduplicate feats by canonical key, keep the one with the highest precedence
  const dedupedByCanonical = new Map<string, FeatRow>();
  for (const row of candidates) {
    const key = canonicalFeatKey(row);
    const existing = dedupedByCanonical.get(key);
    if (!existing) {
      dedupedByCanonical.set(key, row);
      continue;
    }
    if (featPrecedence(row, scope) > featPrecedence(existing, scope)) {
      dedupedByCanonical.set(key, row);
    }
  }

  // return the deduplicated feats sorted by name
  return Array.from(dedupedByCanonical.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

/**
 * Searches for effective items based on the provided reference scope, search query, limit, and offset.
 * @param param0 An object containing the reference scope, search query, limit, and offset for the item search.
 * @returns A promise that resolves to an object containing the rows of effective items matching the search criteria and the total count of matching items.
 */
export const searchEffectiveItems = async ({
  scope,
  query,
  limit,
  offset,
}: {
  scope: ReferenceScope;
  query: string;
  limit: number;
  offset: number;
}): Promise<{ rows: ItemRow[]; total: number }> => {
  const searchString = query.trim();

  // visibility filter based on the scope
  // includes core + homebrew items that are published and relevant to campaign and character context
  const visibilityFilter = scope.campaignId
    ? or(
        and(eq(items.sourceType, "core"), eq(items.isPublished, true)),
        and(
          eq(items.sourceType, "homebrew"),
          eq(items.isPublished, true),
          eq(items.ownerCampaignId, scope.campaignId),
          scope.characterId
            ? or(
                eq(items.ownerCharacterId, scope.characterId),
                sql`${items.ownerCharacterId} IS NULL`,
              )
            : sql`${items.ownerCharacterId} IS NULL`,
        ),
      )
    : and(eq(items.sourceType, "core"), eq(items.isPublished, true));

  // fetch candidate items based on visibility filter and search string, order by relevance or name, limit to 500 results
  const candidates = searchString
    ? await db
        .select()
        .from(items)
        .where(
          and(
            visibilityFilter,
            sql`to_tsvector('english', ${items.name} || ' ' || ${items.description}) @@ plainto_tsquery('english', ${searchString})`,
          ),
        )
        .orderBy(
          desc(
            sql`ts_rank(to_tsvector('english', ${items.name} || ' ' || ${items.description}), plainto_tsquery('english', ${searchString}))`,
          ),
        )
        .limit(500)
    : await db
        .select()
        .from(items)
        .where(visibilityFilter)
        .orderBy(asc(items.name))
        .limit(500);

  // deduplicate items by canonical key, keep the one with the highest precedence
  const dedupedByCanonical = new Map<string, ItemRow>();
  for (const row of candidates) {
    const key = canonicalItemKey(row);
    const existing = dedupedByCanonical.get(key);
    if (!existing) {
      dedupedByCanonical.set(key, row);
      continue;
    }
    if (itemPrecedence(row, scope) > itemPrecedence(existing, scope)) {
      dedupedByCanonical.set(key, row);
    }
  }

  // return the deduplicated items sorted by name, applying the specified offset and limit
  const all = Array.from(dedupedByCanonical.values());
  return {
    rows: all.slice(offset, offset + limit),
    total: all.length,
  };
};
