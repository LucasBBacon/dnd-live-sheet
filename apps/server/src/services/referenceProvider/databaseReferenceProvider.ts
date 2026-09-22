import { db } from "@project/database";
import {
  characterClasses,
  characters,
} from "@project/database/src/schema/operational.js";
import { TraitDefinitionSchema, type TraitDefinition } from "@project/shared";
import { and, eq } from "drizzle-orm";
import {
  getEffectiveReferenceSnapshot,
  listEffectiveFeats,
  searchEffectiveItems,
  type EffectiveReferenceSnapshot,
} from "../effectiveReferenceResolver.js";
import {
  assessMulticlassPrerequisites,
  resolveNextLevelValidationContext,
} from "../levelUpValidation.js";
import {
  getReferenceCache,
  getReferenceCacheVersion,
  warmReferenceCache,
} from "../referenceCache.js";
import { getCachedRuleSnapshot } from "../ruleSnapshotCache.js";
import { primePackRulebook } from "../packRulebook.js";
import { classLedgerOrder } from "../classLedger.js";
import {
  buildLevelUpSaves,
  finalAbilityScores,
  questionsNewAtLevel,
  readStoredChoices,
  toCharacterSave,
} from "../characterSave.js";
import type { ChoiceQuestion } from "@project/engine";
import type {
  LevelUpOptionsInput,
  ReferenceProvider,
  ScopedContext,
  TraitCategory,
} from "./types.js";

const hasProficiencyCategory = (
  definition: TraitDefinition,
  categories: string[],
): boolean =>
  (definition.proficiencies?.fixed ?? []).some((grant) =>
    categories.includes(grant.category),
  ) ||
  (definition.proficiencies?.choices ?? []).some((choice) =>
    categories.includes(choice.category),
  );

/**
 * Exported for `reference.test.ts`, which drives the real filter through the
 * setupReferenceApp harness instead of re-implementing it as a local
 * predicate - the trap the four blocks this replaces fell into.
 */
export const matchesTraitCategory = (
  trait: { definition: TraitDefinition },
  category: TraitCategory,
): boolean => {
  if (category === "skills") {
    return hasProficiencyCategory(trait.definition, ["skills"]);
  }

  return hasProficiencyCategory(trait.definition, ["tools", "languages"]);
};

export interface TraitCategoryFilterResult<T> {
  traits: T[];
  /** Rows whose stored definition did not parse. Named, never silently dropped. */
  malformedTraitIds: string[];
}

/**
 * Filters trait rows by category, validating each stored definition first.
 *
 * `traits.definition` is jsonb declared `$type<TraitDefinition>()` - a
 * compile-time claim and no runtime check - and the call site used to cast
 * straight through it. A row written before a schema change therefore did not
 * error: it read as a trait with no proficiencies and dropped out of the
 * filter, so the endpoint returned an empty list and looked like it had simply
 * found nothing.
 *
 * The policy is `projectEquipmentRows`': one unparsable row is named and
 * skipped so a browse endpoint stays up, but every row failing in a non-empty
 * set is a schema divergence rather than bad data, and throws.
 */
export const filterTraitsByCategory = <T extends { id: string; definition: unknown }>(
  rows: readonly T[],
  category: TraitCategory,
): TraitCategoryFilterResult<T> => {
  const traits: T[] = [];
  const malformedTraitIds: string[] = [];

  for (const row of rows) {
    const parsed = TraitDefinitionSchema.safeParse(row.definition);

    if (!parsed.success) {
      malformedTraitIds.push(row.id);
      continue;
    }

    if (matchesTraitCategory({ definition: parsed.data }, category)) {
      traits.push(row);
    }
  }

  // Zero of zero failing is an empty table, not a break - the same carve-out
  // the equipment projection makes for the empty catalogue.
  if (rows.length > 0 && malformedTraitIds.length === rows.length) {
    throw new Error(
      `[databaseReferenceProvider] every one of ${rows.length} trait rows failed to parse against TraitDefinition; the stored definitions and the schema have diverged`,
    );
  }

  return { traits, malformedTraitIds };
};

const buildClassTimeline = ({
  cache,
  classId,
  requestedSubclassId,
}: {
  cache: EffectiveReferenceSnapshot;
  classId: string;
  requestedSubclassId: string | undefined;
}) => {
  const levels = cache.classLevelsByClassId.get(classId) ?? [];
  const levelMetaByLevel = new Map(levels.map((row) => [row.level, row]));

  let subclassGrantedFeatures: Array<{
    level: number;
    trait: any;
  }> = [];

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

  const classFeaturesByLevel = new Map<number, any[]>(
    Array.from({ length: 20 }, (_, i) => i + 1).map((level) => [
      level,
      cache.classTraitsByClassLevel.get(`${classId}::${level}`) ?? [],
    ]),
  );

  const subclassFeaturesByLevel = new Map<number, any[]>(
    Array.from({ length: 20 }, (_, i) => i + 1).map((level) => [
      level,
      subclassGrantedFeatures
        .filter((feature) => feature.level === level)
        .map((feature) => feature.trait),
    ]),
  );

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

const buildNextLevelContext = ({
  classId,
  currentClassLevel,
  requestedSubclassId,
  isMulticlassDip,
}: {
  classId: string;
  currentClassLevel: number;
  requestedSubclassId: string | undefined;
  isMulticlassDip: boolean;
}) =>
  resolveNextLevelValidationContext({
    classId,
    currentClassLevel,
    isMulticlassDip,
    ...(requestedSubclassId !== undefined ? { requestedSubclassId } : {}),
  });

/**
 * A character as the level-up options read it: the stored row, its class
 * ledger in the order the classes were taken, and its stored answers. Null
 * when no character is in scope (or it is not in the scoped campaign).
 */
const loadCharacterForLevelUp = async ({
  characterId,
  campaignId,
}: {
  characterId: string | undefined;
  campaignId: string | undefined;
}) => {
  if (!characterId) {
    return null;
  }

  const characterScopeFilter = campaignId
    ? and(eq(characters.id, characterId), eq(characters.campaignId, campaignId))
    : eq(characters.id, characterId);

  const [character] = await db
    .select({
      raceId: characters.raceId,
      subraceId: characters.subraceId,
      backgroundId: characters.backgroundId,
      choices: characters.choices,
      str: characters.str,
      dex: characters.dex,
      con: characters.con,
      int: characters.int,
      wis: characters.wis,
      cha: characters.cha,
      currentHp: characters.currentHp,
      maxHp: characters.maxHp,
    })
    .from(characters)
    .where(characterScopeFilter)
    .limit(1);

  if (!character) {
    return null;
  }

  const ledger = await db
    .select({
      classId: characterClasses.classId,
      classLevel: characterClasses.classLevel,
      subclassId: characterClasses.subclassId,
    })
    .from(characterClasses)
    .where(eq(characterClasses.characterId, characterId))
    .orderBy(...classLedgerOrder);

  return {
    character,
    ledger,
    storedChoices: readStoredChoices(character.choices, characterId),
  };
};

export class DatabaseReferenceProvider implements ReferenceProvider {
  public readonly source = "db" as const;

  public async warm(): Promise<void> {
    await warmReferenceCache();
    // the relation tables the cache above holds are a query model; the rule
    // ASTs live in the pack payload, and levelUpValidation reads them
    await primePackRulebook();
  }

  public async getRaces(scope: ScopedContext): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);

    return cache.races.map((race) => {
      const baseTraits = (cache.raceTraitsByRaceId.get(race.id) ?? []).map(
        (trait) => ({ ...trait, sourceOrigin: `Race: ${race.name}` }),
      );
      const associatedSubraces = (cache.subracesByRaceId.get(race.id) ?? []).map(
        (subrace) => {
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
        },
      );

      return { ...race, traits: baseTraits, subraces: associatedSubraces };
    });
  }

  public async getClasses(scope: ScopedContext): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);
    return cache.classes;
  }

  public async getFeats(scope: ScopedContext): Promise<unknown[]> {
    return listEffectiveFeats(scope);
  }

  public async getLevelUpOptions(input: LevelUpOptionsInput): Promise<{
    classes: unknown[];
    feats: unknown[];
    subclasses: unknown[];
    timeline: unknown[];
    nextLevel: unknown | null;
    supportByClass: Record<string, unknown>;
    choiceQuestions: ChoiceQuestion[];
    selected: {
      classId: string | null;
      subclassId: string | null;
    };
  }> {
    const { scope, classId, subclassId, featId, currentClassLevel } = input;
    const cache = await getEffectiveReferenceSnapshot(scope);
    const feats = await listEffectiveFeats(scope);
    const loaded = await loadCharacterForLevelUp({
      characterId: scope.characterId,
      campaignId: scope.campaignId,
    });
    const { snapshot } = await getCachedRuleSnapshot();

    const classLevelsByClassId: Record<string, number> = Object.fromEntries(
      (loaded?.ledger ?? []).map((row) => [row.classId, row.classLevel]),
    );
    // final scores, not the stored pre-racial ones: a multiclass
    // prerequisite is met by the scores the sheet shows (#77)
    const currentBaseScores = loaded
      ? finalAbilityScores(
          toCharacterSave(loaded.character, loaded.ledger, loaded.storedChoices),
          snapshot,
        )
      : null;

    // the character before and after this level, built the same way
    // applyLevelUp builds them for its required check - the subclass is the
    // requested one, else the one already stored for the class
    const levelUpSaves =
      loaded && classId
        ? buildLevelUpSaves({
            ...loaded,
            targetClassId: classId,
            subclassId,
            featId,
          })
        : null;
    const effectiveSubclassId = levelUpSaves?.subclassId ?? subclassId;
    // questionsNewAtLevel judges each option's `unmet` against
    // levelUpSaves.after, which is the character after the level but without
    // this level-up's own answers - so an option gated on a pick made at this
    // same level (a trait or spell first obtainable at this class level)
    // would show permanently disabled with no way to satisfy it. No pack
    // option does this today; #85 records the pack-validation rule that
    // would enforce it.
    const choiceQuestions = levelUpSaves
      ? questionsNewAtLevel(levelUpSaves, snapshot)
      : [];

    const subclasses = classId ? (cache.subclassesByClassId.get(classId) ?? []) : [];

    const timeline = classId
      ? buildClassTimeline({
          cache,
          classId,
          requestedSubclassId: effectiveSubclassId ?? undefined,
        })
      : [];

    const selectedClassCurrentLevel = classId
      ? (classLevelsByClassId[classId] ?? currentClassLevel)
      : currentClassLevel;
    const selectedClassIsDip = classId
      ? (classLevelsByClassId[classId] ?? 0) === 0 &&
        Object.keys(classLevelsByClassId).length > 0
      : false;

    const nextLevel = classId
      ? buildNextLevelContext({
          classId,
          currentClassLevel: selectedClassCurrentLevel,
          requestedSubclassId: effectiveSubclassId ?? undefined,
          isMulticlassDip: selectedClassIsDip,
        })
      : null;

    const supportByClass = Object.fromEntries(
      cache.classes.map((cls) => {
        const clsCurrentLevel = classLevelsByClassId[cls.id] ?? 0;
        const isMulticlassDip =
          clsCurrentLevel === 0 && Object.keys(classLevelsByClassId).length > 0;
        const support = buildNextLevelContext({
          classId: cls.id,
          currentClassLevel: clsCurrentLevel,
          requestedSubclassId: undefined,
          isMulticlassDip,
        });

        const multiclassPreview =
          isMulticlassDip && currentBaseScores
            ? assessMulticlassPrerequisites({
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

    return {
      classes: cache.classes,
      feats,
      subclasses,
      timeline,
      nextLevel,
      supportByClass,
      choiceQuestions,
      selected: {
        classId: classId ?? null,
        subclassId: subclassId ?? null,
      },
    };
  }

  public async getSubclasses(
    scope: ScopedContext,
    classId: string,
  ): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);
    return cache.subclassesByClassId.get(classId) ?? [];
  }

  public async getClassTimeline(
    scope: ScopedContext,
    classId: string,
    requestedSubclassId?: string,
  ): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);
    return buildClassTimeline({
      cache,
      classId,
      requestedSubclassId,
    });
  }

  public async getBackgrounds(scope: ScopedContext): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);

    return cache.backgrounds.map((background) => {
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
  }

  public async getTraits(
    scope: ScopedContext,
    category?: TraitCategory,
  ): Promise<unknown[]> {
    const cache = await getEffectiveReferenceSnapshot(scope);
    const allTraits = cache.traits;

    if (!category) {
      return allTraits;
    }

    const { traits, malformedTraitIds } = filterTraitsByCategory(
      allTraits,
      category,
    );

    // Named rather than swallowed: a definition that stopped parsing used to
    // leave no trace at all, which is what made this class of staleness
    // invisible until someone noticed the list was short.
    if (malformedTraitIds.length > 0) {
      console.warn(
        `[databaseReferenceProvider] ${malformedTraitIds.length} trait rows failed to parse against TraitDefinition and were skipped: ${malformedTraitIds.join(", ")}`,
      );
    }

    return traits;
  }

  public async getTraitById(
    scope: ScopedContext,
    traitId: string,
  ): Promise<unknown | null> {
    const cache = await getEffectiveReferenceSnapshot(scope);
    return cache.traitsById.get(traitId) ?? null;
  }

  public async getVersion(): Promise<{ version: number; loadedAt: number }> {
    const cache = await getReferenceCache();
    return {
      version: getReferenceCacheVersion(),
      loadedAt: cache.loadedAt,
    };
  }

  public async searchItems(input: {
    scope: ScopedContext;
    query: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: unknown[]; total: number }> {
    const { rows, total } = await searchEffectiveItems({
      scope: input.scope,
      query: input.query,
      limit: input.limit,
      offset: input.offset,
    });

    return { rows, total };
  }

  public async getRulesSnapshot(_scope: ScopedContext): Promise<{
    version: number;
    loadedAt: number;
    snapshot: any;
  }> {
    const cachedSnapshot = await getCachedRuleSnapshot();

    return {
      version: cachedSnapshot.cacheVersion,
      loadedAt: cachedSnapshot.loadedAt,
      snapshot: cachedSnapshot.snapshot,
    };
  }
}
