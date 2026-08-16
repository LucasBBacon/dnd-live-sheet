import type { CoreRulePack } from "@project/shared";
import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { projectCoreRulePack } from "./corePackProjection.js";
import {
  backgrounds,
  backgroundTraits,
  bundleContents,
  classes,
  classLevels,
  classMulticlassTraits,
  classProgressions,
  coreRulePacks,
  featPrerequisiteFeats,
  feats,
  featTraits,
  items,
  races,
  raceTraits,
  subraces,
  subraceTraits,
  subclasses,
  subclassLevels,
  subclassProgressions,
  traits,
} from "./schema/reference.js";

export type CoreRulePackImportResult = {
  packId: string;
  version: number;
  publishedAt: Date;
};

const normalizeLore = (lore: {
  shortDescription: string;
  fullText?: string | undefined;
}) =>
  lore.fullText === undefined
    ? { shortDescription: lore.shortDescription }
    : { shortDescription: lore.shortDescription, fullText: lore.fullText };

/**
 * Replaces the disposable reference projection with one validated core pack.
 *
 * The pack payload retains every rule AST. The relational rows are a derived
 * query model rebuilt in the same transaction, so a failed write cannot leave
 * the payload and projection on different versions.
 */
export const persistCoreRulePack = async (
  pack: CoreRulePack,
): Promise<CoreRulePackImportResult> => {
  const publishedAt = new Date(pack.pack.publishedAt);
  const projection = projectCoreRulePack(pack);
  const scope = {
    sourceType: "core" as const,
    ownerCampaignId: null,
    ownerCharacterId: null,
    createdByUserId: null,
    isPublished: true,
    packId: pack.pack.packId,
    packVersion: pack.pack.version,
    publishedAt,
  };

  await db.transaction(async (tx) => {
    // Reference rows have foreign keys into operational data. The migration is
    // intentionally destructive, so CASCADE clears the old projection and any
    // development state that depended on it before the new pack is inserted.
    await tx.execute(sql`
      TRUNCATE TABLE
        bundle_contents,
        background_traits,
        subclass_progressions,
        class_progressions,
        class_multiclass_traits,
        subrace_traits,
        race_traits,
        feat_prerequisites,
        feat_traits,
        subclass_levels,
        class_levels,
        items,
        backgrounds,
        subclasses,
        classes,
        subraces,
        races,
        feats,
        traits,
        core_rule_packs
      CASCADE
    `);

    await tx
      .insert(coreRulePacks)
      .values({
        packId: pack.pack.packId,
        version: pack.pack.version,
        ruleset: pack.pack.ruleset,
        ...(pack.pack.contentHash === undefined
          ? {}
          : { contentHash: pack.pack.contentHash }),
        payload: pack,
        publishedAt,
      })
      .onConflictDoNothing();

    if (projection.traits.length > 0) {
      await tx.insert(traits).values(
        projection.traits.map((trait) => ({
          ...trait,
          ...scope,
        })),
      );
    }
    if (projection.feats.length > 0) {
      await tx.insert(feats).values(
        projection.feats.map((feat) => ({ ...feat, ...scope })),
      );
    }
    if (projection.races.length > 0) {
      await tx.insert(races).values(
        projection.races.map((race) => ({ ...race, ...scope })),
      );
    }
    if (projection.subraces.length > 0) {
      await tx.insert(subraces).values(
        projection.subraces.map((subrace) => ({ ...subrace, ...scope })),
      );
    }
    if (projection.classes.length > 0) {
      await tx.insert(classes).values(
        projection.classes.map((entry) => ({ ...entry, ...scope })),
      );
    }
    if (projection.subclasses.length > 0) {
      await tx.insert(subclasses).values(
        projection.subclasses.map((entry) => ({ ...entry, ...scope })),
      );
    }
    if (projection.backgrounds.length > 0) {
      await tx.insert(backgrounds).values(
        projection.backgrounds.map((background) => ({
          ...background,
          lore: normalizeLore(background.lore),
          ...scope,
        })),
      );
    }
    if (projection.items.length > 0) {
      await tx.insert(items).values(
        projection.items.map((item) => ({ ...item, ...scope })),
      );
    }

    if (projection.classLevels.length > 0)
      await tx.insert(classLevels).values(projection.classLevels);
    if (projection.subclassLevels.length > 0)
      await tx.insert(subclassLevels).values(projection.subclassLevels);
    if (projection.featTraits.length > 0)
      await tx.insert(featTraits).values(projection.featTraits);
    if (projection.featPrerequisiteFeats.length > 0)
      await tx.insert(featPrerequisiteFeats).values(projection.featPrerequisiteFeats);
    if (projection.raceTraits.length > 0)
      await tx.insert(raceTraits).values(projection.raceTraits);
    if (projection.subraceTraits.length > 0)
      await tx.insert(subraceTraits).values(projection.subraceTraits);
    if (projection.classMulticlassTraits.length > 0)
      await tx.insert(classMulticlassTraits).values(projection.classMulticlassTraits);
    if (projection.classProgressions.length > 0)
      await tx.insert(classProgressions).values(
        projection.classProgressions.map((entry) => ({ ...entry, ...scope })),
      );
    if (projection.subclassProgressions.length > 0)
      await tx.insert(subclassProgressions).values(
        projection.subclassProgressions.map((entry) => ({ ...entry, ...scope })),
      );
    if (projection.backgroundTraits.length > 0)
      await tx.insert(backgroundTraits).values(projection.backgroundTraits);
    if (projection.bundleContents.length > 0)
      await tx.insert(bundleContents).values(projection.bundleContents);
  });

  return {
    packId: pack.pack.packId,
    version: pack.pack.version,
    publishedAt,
  };
};
