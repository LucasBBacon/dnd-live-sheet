import { db } from "@project/database";
import { feats, items, traits } from "@project/database/src/schema/reference.js";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import {
  type ReferenceCacheSnapshot,
  getReferenceCache,
  getReferenceCacheVersion,
} from "./referenceCache.js";

type TraitRow = typeof traits.$inferSelect;
type FeatRow = typeof feats.$inferSelect;
type ItemRow = typeof items.$inferSelect;

export type ReferenceScope = {
  campaignId?: string;
  characterId?: string;
};

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

const scopedSnapshotCache = new Map<
  string,
  { version: number; snapshot: EffectiveReferenceSnapshot }
>();

const scopeKey = ({ campaignId, characterId }: ReferenceScope): string =>
  `${campaignId ?? "core"}::${characterId ?? "none"}`;

const traitPrecedence = (
  row: TraitRow,
  _scopeCampaignId: string,
  scopeCharacterId?: string,
): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scopeCharacterId) return 2;
  return 1;
};

const canonicalTraitKey = (row: TraitRow): string => row.supersedesId ?? row.id;

const copyMap = <T>(source: Map<string, T[]>): Map<string, T[]> =>
  new Map(Array.from(source.entries(), ([k, v]) => [k, [...v]]));

const remapTraitLinks = (
  source: Map<string, TraitRow[]>,
  traitByLookupId: Map<string, TraitRow>,
): Map<string, TraitRow[]> => {
  const next = new Map<string, TraitRow[]>();
  for (const [key, rows] of source.entries()) {
    const resolved = rows
      .map((row) => traitByLookupId.get(row.id) ?? row)
      .filter((row, index, arr) => arr.findIndex((item) => item.id === row.id) === index);
    next.set(key, resolved);
  }
  return next;
};

const buildCoreOnlySnapshot = (core: ReferenceCacheSnapshot): EffectiveReferenceSnapshot => ({
  ...core,
  traits: [...core.traits],
  traitsById: new Map(core.traitsById),
  raceTraitsByRaceId: copyMap(core.raceTraitsByRaceId),
  subraceTraitsBySubraceId: copyMap(core.subraceTraitsBySubraceId),
  classTraitsByClassLevel: copyMap(core.classTraitsByClassLevel),
  subclassTraitsBySubclassLevel: copyMap(core.subclassTraitsBySubclassLevel),
  backgroundTraitsByBackgroundId: copyMap(core.backgroundTraitsByBackgroundId),
});

export const getEffectiveReferenceSnapshot = async (
  scope: ReferenceScope,
): Promise<EffectiveReferenceSnapshot> => {
  const version = getReferenceCacheVersion();
  const key = scopeKey(scope);
  const cached = scopedSnapshotCache.get(key);
  if (cached && cached.version === version) {
    return cached.snapshot;
  }

  const core = await getReferenceCache();
  if (!scope.campaignId) {
    const next = buildCoreOnlySnapshot(core);
    scopedSnapshotCache.set(key, { version, snapshot: next });
    return next;
  }

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

  const effectiveByCanonicalId = new Map<string, TraitRow>(
    core.traits.map((row) => [row.id, row]),
  );

  const orderedHomebrew = [...homebrewTraits].sort((a, b) => {
    const precedenceDiff =
      traitPrecedence(b, scope.campaignId!, scope.characterId) -
      traitPrecedence(a, scope.campaignId!, scope.characterId);
    if (precedenceDiff !== 0) return precedenceDiff;
    return a.id.localeCompare(b.id);
  });

  for (const row of orderedHomebrew) {
    const canonicalId = canonicalTraitKey(row);
    const existing = effectiveByCanonicalId.get(canonicalId);
    if (!existing) {
      effectiveByCanonicalId.set(canonicalId, row);
      continue;
    }

    if (
      traitPrecedence(row, scope.campaignId, scope.characterId) >
      traitPrecedence(existing, scope.campaignId, scope.characterId)
    ) {
      effectiveByCanonicalId.set(canonicalId, row);
    }
  }

  const traitsById = new Map<string, TraitRow>(core.traitsById);
  for (const [canonicalId, row] of effectiveByCanonicalId.entries()) {
    traitsById.set(canonicalId, row);
    traitsById.set(row.id, row);
  }

  const scopedSnapshot: EffectiveReferenceSnapshot = {
    ...core,
    traits: Array.from(effectiveByCanonicalId.values()),
    traitsById,
    raceTraitsByRaceId: remapTraitLinks(core.raceTraitsByRaceId, traitsById),
    subraceTraitsBySubraceId: remapTraitLinks(core.subraceTraitsBySubraceId, traitsById),
    classTraitsByClassLevel: remapTraitLinks(core.classTraitsByClassLevel, traitsById),
    subclassTraitsBySubclassLevel: remapTraitLinks(
      core.subclassTraitsBySubclassLevel,
      traitsById,
    ),
    backgroundTraitsByBackgroundId: remapTraitLinks(
      core.backgroundTraitsByBackgroundId,
      traitsById,
    ),
  };

  scopedSnapshotCache.set(key, { version, snapshot: scopedSnapshot });
  return scopedSnapshot;
};

const itemPrecedence = (row: ItemRow, scope: ReferenceScope): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scope.characterId) return 2;
  return 1;
};

const canonicalItemKey = (row: ItemRow): string => row.supersedesId ?? row.id;

const featPrecedence = (row: FeatRow, scope: ReferenceScope): number => {
  if (row.sourceType === "core") return 0;
  if (row.ownerCharacterId && row.ownerCharacterId === scope.characterId) return 2;
  return 1;
};

const canonicalFeatKey = (row: FeatRow): string => row.supersedesId ?? row.id;

export const listEffectiveFeats = async (
  scope: ReferenceScope,
): Promise<FeatRow[]> => {
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

  const candidates = await db
    .select()
    .from(feats)
    .where(visibilityFilter)
    .orderBy(asc(feats.name));

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

  return Array.from(dedupedByCanonical.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

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

  const all = Array.from(dedupedByCanonical.values());
  return {
    rows: all.slice(offset, offset + limit),
    total: all.length,
  };
};
