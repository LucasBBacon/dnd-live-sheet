import { createHash } from "node:crypto";
import { db } from "@project/database";
import {
  backgroundTraits,
  backgrounds,
  bundleContents,
  classLevels,
  classMulticlassTraits,
  classProgressions,
  classes,
  featPrerequisiteFeats,
  featTraits,
  feats,
  importIssues,
  importRows,
  importRuns,
  items,
  raceTraits,
  races,
  subraceTraits,
  subraces,
  subclassLevels,
  subclassProgressions,
  subclasses,
  traits,
} from "@project/database/src/schema/reference.js";
import {
  ImportEntityEntrySchema,
  ImportPackSchema,
  ImportRelationEntrySchema,
  type ImportEntityEntry,
  type ImportPack,
  type ImportRelationEntry,
} from "@project/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCampaignMembershipRole } from "./campaignAccess.js";
import { invalidateReferenceCache } from "./referenceCache.js";
import { invalidateRuleSnapshotCache } from "./ruleSnapshotCache.js";

type ImportRunRow = typeof importRuns.$inferSelect;
type ImportRowRow = typeof importRows.$inferSelect;

type ImportIssue = {
  rowIndex?: number;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  details?: unknown;
};

type ParsedLedgerRow =
  | { row: ImportRowRow; entity: ImportEntityEntry; relation?: undefined }
  | { row: ImportRowRow; relation: ImportRelationEntry; entity?: undefined };

type ImportPlanSummary = {
  runId: string;
  status: "planned";
  insertCount: number;
  updateCount: number;
  archiveCount: number;
  relationAddCount: number;
  relationRemoveCount: number;
  skipCount: number;
};

class ImportPipelineError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ImportPipelineError";
    this.statusCode = statusCode;
  }
}

const buildChecksum = (pack: ImportPack): string =>
  createHash("sha256").update(JSON.stringify(pack)).digest("hex");

const mapEntityRowsForLedger = (
  runId: string,
  entries: ImportEntityEntry[],
): Array<typeof importRows.$inferInsert> =>
  entries.map((entry, index) => ({
    runId,
    rowIndex: index,
    rowType: "entity",
    kind: entry.kind,
    op: entry.op,
    entityId: entry.id,
    payload: entry,
    status: "pending",
  }));

const mapRelationRowsForLedger = (
  runId: string,
  relations: ImportRelationEntry[],
  offset: number,
): Array<typeof importRows.$inferInsert> =>
  relations.map((relation, index) => ({
    runId,
    rowIndex: offset + index,
    rowType: "relation",
    kind: relation.kind,
    op: relation.op,
    payload: relation,
    status: "pending",
  }));

const getRun = async (runId: string): Promise<ImportRunRow> => {
  const [run] = await db.select().from(importRuns).where(eq(importRuns.id, runId)).limit(1);
  if (!run) throw new ImportPipelineError("Import run not found.", 404);
  return run;
};

const getRunRows = async (runId: string): Promise<ImportRowRow[]> =>
  db
    .select()
    .from(importRows)
    .where(eq(importRows.runId, runId))
    .orderBy(importRows.rowIndex);

const ensureImportPermissions = async (pack: ImportPack, actorUserId: string): Promise<void> => {
  if (pack.pack.sourceType !== "homebrew") return;

  const campaignId = pack.pack.ownerCampaignId;
  if (!campaignId) {
    throw new ImportPipelineError("Homebrew imports require ownerCampaignId.");
  }

  const role = await getCampaignMembershipRole(actorUserId, campaignId);
  if (!role || !["owner", "dm"].includes(role)) {
    throw new ImportPipelineError("Insufficient campaign role for import action.", 403);
  }
};

const commonReferenceScopeForRun = (run: ImportRunRow) => ({
  sourceType: run.sourceType,
  ownerCampaignId: run.ownerCampaignId,
  ownerCharacterId: run.ownerCharacterId,
  createdByUserId: run.createdByUserId,
  isPublished: run.publishMode === "published",
  packId: run.packId,
  packVersion: run.packVersion,
  publishedAt: run.publishMode === "published" ? new Date() : null,
});

const totalDurationFromStagedAt = (run: ImportRunRow): number =>
  Math.max(0, Date.now() - run.stagedAt.getTime());

const markRunIssues = async (
  runId: string,
  issues: ImportIssue[],
): Promise<void> => {
  await db.delete(importIssues).where(eq(importIssues.runId, runId));

  if (issues.length === 0) return;

  await db.insert(importIssues).values(
    issues.map((issue) => ({
      runId,
      rowIndex: issue.rowIndex,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      details: issue.details,
    })),
  );
};

const updateLedgerRowStatus = async (
  runId: string,
  rowIndex: number,
  status: "pending" | "validated" | "applied" | "failed" | "skipped",
  errorMessage?: string,
): Promise<void> => {
  await db
    .update(importRows)
    .set({ status, errorMessage: errorMessage ?? null })
    .where(
      and(eq(importRows.runId, runId), eq(importRows.rowIndex, rowIndex)),
    );
};

const entityExists = async (entry: ImportEntityEntry): Promise<boolean> => {
  switch (entry.kind) {
    case "trait": {
      const [row] = await db.select({ id: traits.id }).from(traits).where(eq(traits.id, entry.id)).limit(1);
      return !!row;
    }
    case "feat": {
      const [row] = await db.select({ id: feats.id }).from(feats).where(eq(feats.id, entry.id)).limit(1);
      return !!row;
    }
    case "race": {
      const [row] = await db.select({ id: races.id }).from(races).where(eq(races.id, entry.id)).limit(1);
      return !!row;
    }
    case "subrace": {
      const [row] = await db.select({ id: subraces.id }).from(subraces).where(eq(subraces.id, entry.id)).limit(1);
      return !!row;
    }
    case "class": {
      const [row] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, entry.id)).limit(1);
      return !!row;
    }
    case "subclass": {
      const [row] = await db.select({ id: subclasses.id }).from(subclasses).where(eq(subclasses.id, entry.id)).limit(1);
      return !!row;
    }
    case "background": {
      const [row] = await db.select({ id: backgrounds.id }).from(backgrounds).where(eq(backgrounds.id, entry.id)).limit(1);
      return !!row;
    }
    case "item": {
      const [row] = await db.select({ id: items.id }).from(items).where(eq(items.id, entry.id)).limit(1);
      return !!row;
    }
    case "class_level": {
      const [row] = await db
        .select({ classId: classLevels.classId })
        .from(classLevels)
        .where(and(eq(classLevels.classId, entry.data.classId), eq(classLevels.level, entry.data.level)))
        .limit(1);
      return !!row;
    }
    case "subclass_level": {
      const [row] = await db
        .select({ subclassId: subclassLevels.subclassId })
        .from(subclassLevels)
        .where(and(eq(subclassLevels.subclassId, entry.data.subclassId), eq(subclassLevels.level, entry.data.level)))
        .limit(1);
      return !!row;
    }
    default:
      return false;
  }
};

const fetchExistingIds = async (
  kind:
    | "trait"
    | "feat"
    | "race"
    | "subrace"
    | "class"
    | "subclass"
    | "background"
    | "item",
  ids: Set<string>,
): Promise<Set<string>> => {
  if (ids.size === 0) return new Set<string>();

  const idList = [...ids];
  switch (kind) {
    case "trait": {
      const rows = await db
        .select({ id: traits.id })
        .from(traits)
        .where(inArray(traits.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "feat": {
      const rows = await db
        .select({ id: feats.id })
        .from(feats)
        .where(inArray(feats.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "race": {
      const rows = await db
        .select({ id: races.id })
        .from(races)
        .where(inArray(races.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "subrace": {
      const rows = await db
        .select({ id: subraces.id })
        .from(subraces)
        .where(inArray(subraces.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "class": {
      const rows = await db
        .select({ id: classes.id })
        .from(classes)
        .where(inArray(classes.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "subclass": {
      const rows = await db
        .select({ id: subclasses.id })
        .from(subclasses)
        .where(inArray(subclasses.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "background": {
      const rows = await db
        .select({ id: backgrounds.id })
        .from(backgrounds)
        .where(inArray(backgrounds.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "item": {
      const rows = await db
        .select({ id: items.id })
        .from(items)
        .where(inArray(items.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    default:
      return new Set<string>();
  }
};

const preflightRelationAndDependencyIssues = async (
  parsedRows: ParsedLedgerRow[],
): Promise<ImportIssue[]> => {
  const issues: ImportIssue[] = [];

  const referencedIds = {
    trait: new Set<string>(),
    feat: new Set<string>(),
    race: new Set<string>(),
    subrace: new Set<string>(),
    class: new Set<string>(),
    subclass: new Set<string>(),
    background: new Set<string>(),
    item: new Set<string>(),
  };

  const stagedEntityIds = {
    trait: new Set<string>(),
    feat: new Set<string>(),
    race: new Set<string>(),
    subrace: new Set<string>(),
    class: new Set<string>(),
    subclass: new Set<string>(),
    background: new Set<string>(),
    item: new Set<string>(),
  };

  for (const parsed of parsedRows) {
    if (parsed.entity && parsed.entity.op !== "archive") {
      switch (parsed.entity.kind) {
        case "trait":
        case "feat":
        case "race":
        case "subrace":
        case "class":
        case "subclass":
        case "background":
        case "item":
          stagedEntityIds[parsed.entity.kind].add(parsed.entity.id);
          break;
        default:
          break;
      }
    }

    if (parsed.entity?.supersedesId) {
      switch (parsed.entity.kind) {
        case "trait":
        case "feat":
        case "race":
        case "subrace":
        case "class":
        case "subclass":
        case "background":
        case "item":
          referencedIds[parsed.entity.kind].add(parsed.entity.supersedesId);
          break;
        default:
          break;
      }
    }

    if (parsed.entity) {
      switch (parsed.entity.kind) {
        case "subrace":
          referencedIds.race.add(parsed.entity.data.parentRaceId);
          break;
        case "subclass":
          referencedIds.class.add(parsed.entity.data.parentClassId);
          break;
        case "class_level":
          referencedIds.class.add(parsed.entity.data.classId);
          break;
        case "subclass_level":
          referencedIds.subclass.add(parsed.entity.data.subclassId);
          break;
        default:
          break;
      }
    }

    if (parsed.relation && parsed.relation.op === "add") {
      switch (parsed.relation.kind) {
        case "feat_trait":
          referencedIds.feat.add(parsed.relation.featId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "feat_prerequisite":
          referencedIds.feat.add(parsed.relation.featId);
          referencedIds.feat.add(parsed.relation.requiredFeatId);
          break;
        case "race_trait":
          referencedIds.race.add(parsed.relation.raceId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "subrace_trait":
          referencedIds.subrace.add(parsed.relation.subraceId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "class_multiclass_trait":
          referencedIds.class.add(parsed.relation.classId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "class_progression":
          referencedIds.class.add(parsed.relation.classId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "subclass_progression":
          referencedIds.subclass.add(parsed.relation.subclassId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "background_trait":
          referencedIds.background.add(parsed.relation.backgroundId);
          referencedIds.trait.add(parsed.relation.traitId);
          break;
        case "bundle_content":
          referencedIds.item.add(parsed.relation.bundleId);
          referencedIds.item.add(parsed.relation.itemId);
          break;
        default:
          break;
      }
    }
  }

  const [existingTraits, existingFeats, existingRaces, existingSubraces, existingClasses, existingSubclasses, existingBackgrounds, existingItems] =
    await Promise.all([
      fetchExistingIds("trait", referencedIds.trait),
      fetchExistingIds("feat", referencedIds.feat),
      fetchExistingIds("race", referencedIds.race),
      fetchExistingIds("subrace", referencedIds.subrace),
      fetchExistingIds("class", referencedIds.class),
      fetchExistingIds("subclass", referencedIds.subclass),
      fetchExistingIds("background", referencedIds.background),
      fetchExistingIds("item", referencedIds.item),
    ]);

  const exists = (kind: keyof typeof stagedEntityIds, id: string): boolean => {
    const staged = stagedEntityIds[kind];
    if (staged.has(id)) return true;

    switch (kind) {
      case "trait":
        return existingTraits.has(id);
      case "feat":
        return existingFeats.has(id);
      case "race":
        return existingRaces.has(id);
      case "subrace":
        return existingSubraces.has(id);
      case "class":
        return existingClasses.has(id);
      case "subclass":
        return existingSubclasses.has(id);
      case "background":
        return existingBackgrounds.has(id);
      case "item":
        return existingItems.has(id);
      default:
        return false;
    }
  };

  const pushMissing = (
    rowIndex: number,
    kind: keyof typeof stagedEntityIds,
    id: string,
    context: string,
  ) => {
    if (exists(kind, id)) return;
    issues.push({
      rowIndex,
      severity: "error",
      code: "FK_PREFLIGHT_MISSING_REFERENCE",
      message: `${context} references missing ${kind} id: ${id}.`,
      details: { kind, id, context },
    });
  };

  for (const parsed of parsedRows) {
    if (parsed.entity?.supersedesId) {
      switch (parsed.entity.kind) {
        case "trait":
        case "feat":
        case "race":
        case "subrace":
        case "class":
        case "subclass":
        case "background":
        case "item":
          pushMissing(
            parsed.row.rowIndex,
            parsed.entity.kind,
            parsed.entity.supersedesId,
            `${parsed.entity.kind}:${parsed.entity.id} supersedesId`,
          );
          break;
        default:
          break;
      }
    }

    if (parsed.entity) {
      switch (parsed.entity.kind) {
        case "subrace":
          pushMissing(
            parsed.row.rowIndex,
            "race",
            parsed.entity.data.parentRaceId,
            `subrace:${parsed.entity.id} parentRaceId`,
          );
          break;
        case "subclass":
          pushMissing(
            parsed.row.rowIndex,
            "class",
            parsed.entity.data.parentClassId,
            `subclass:${parsed.entity.id} parentClassId`,
          );
          break;
        case "class_level":
          pushMissing(
            parsed.row.rowIndex,
            "class",
            parsed.entity.data.classId,
            `class_level:${parsed.entity.id}`,
          );
          break;
        case "subclass_level":
          pushMissing(
            parsed.row.rowIndex,
            "subclass",
            parsed.entity.data.subclassId,
            `subclass_level:${parsed.entity.id}`,
          );
          break;
        default:
          break;
      }
    }

    if (parsed.relation && parsed.relation.op === "add") {
      switch (parsed.relation.kind) {
        case "feat_trait":
          pushMissing(parsed.row.rowIndex, "feat", parsed.relation.featId, "feat_trait.featId");
          pushMissing(parsed.row.rowIndex, "trait", parsed.relation.traitId, "feat_trait.traitId");
          break;
        case "feat_prerequisite":
          pushMissing(parsed.row.rowIndex, "feat", parsed.relation.featId, "feat_prerequisite.featId");
          pushMissing(
            parsed.row.rowIndex,
            "feat",
            parsed.relation.requiredFeatId,
            "feat_prerequisite.requiredFeatId",
          );
          break;
        case "race_trait":
          pushMissing(parsed.row.rowIndex, "race", parsed.relation.raceId, "race_trait.raceId");
          pushMissing(parsed.row.rowIndex, "trait", parsed.relation.traitId, "race_trait.traitId");
          break;
        case "subrace_trait":
          pushMissing(
            parsed.row.rowIndex,
            "subrace",
            parsed.relation.subraceId,
            "subrace_trait.subraceId",
          );
          pushMissing(parsed.row.rowIndex, "trait", parsed.relation.traitId, "subrace_trait.traitId");
          break;
        case "class_multiclass_trait":
          pushMissing(
            parsed.row.rowIndex,
            "class",
            parsed.relation.classId,
            "class_multiclass_trait.classId",
          );
          pushMissing(
            parsed.row.rowIndex,
            "trait",
            parsed.relation.traitId,
            "class_multiclass_trait.traitId",
          );
          break;
        case "class_progression":
          pushMissing(
            parsed.row.rowIndex,
            "class",
            parsed.relation.classId,
            "class_progression.classId",
          );
          pushMissing(
            parsed.row.rowIndex,
            "trait",
            parsed.relation.traitId,
            "class_progression.traitId",
          );
          break;
        case "subclass_progression":
          pushMissing(
            parsed.row.rowIndex,
            "subclass",
            parsed.relation.subclassId,
            "subclass_progression.subclassId",
          );
          pushMissing(
            parsed.row.rowIndex,
            "trait",
            parsed.relation.traitId,
            "subclass_progression.traitId",
          );
          break;
        case "background_trait":
          pushMissing(
            parsed.row.rowIndex,
            "background",
            parsed.relation.backgroundId,
            "background_trait.backgroundId",
          );
          pushMissing(
            parsed.row.rowIndex,
            "trait",
            parsed.relation.traitId,
            "background_trait.traitId",
          );
          break;
        case "bundle_content":
          pushMissing(
            parsed.row.rowIndex,
            "item",
            parsed.relation.bundleId,
            "bundle_content.bundleId",
          );
          pushMissing(parsed.row.rowIndex, "item", parsed.relation.itemId, "bundle_content.itemId");
          break;
        default:
          break;
      }
    }
  }

  return issues;
};

const applyEntityEntry = async (
  tx: typeof db,
  entry: ImportEntityEntry,
  run: ImportRunRow,
): Promise<void> => {
  const scoped = commonReferenceScopeForRun(run);

  if (entry.op === "archive") {
    switch (entry.kind) {
      case "trait":
        await tx
          .update(traits)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(traits.id, entry.id));
        return;
      case "feat":
        await tx
          .update(feats)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(feats.id, entry.id));
        return;
      case "race":
        await tx
          .update(races)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(races.id, entry.id));
        return;
      case "subrace":
        await tx
          .update(subraces)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(subraces.id, entry.id));
        return;
      case "class":
        await tx
          .update(classes)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(classes.id, entry.id));
        return;
      case "subclass":
        await tx
          .update(subclasses)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(subclasses.id, entry.id));
        return;
      case "background":
        await tx
          .update(backgrounds)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(backgrounds.id, entry.id));
        return;
      case "item":
        await tx
          .update(items)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(items.id, entry.id));
        return;
      default:
        throw new ImportPipelineError(`Archive is not supported for ${entry.kind}.`);
    }
  }

  switch (entry.kind) {
    case "trait": {
      const row: typeof traits.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        lore: entry.data.lore,
        effects: entry.data.effects,
        isStartingProficiency: entry.data.isStartingProficiency,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(traits).values(row).onConflictDoUpdate({
        target: traits.id,
        set: {
          name: sql`excluded.name`,
          lore: sql`excluded.lore`,
          effects: sql`excluded.effects`,
          isStartingProficiency: sql`excluded.is_starting_proficiency`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "feat": {
      const row: typeof feats.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        category: entry.data.category,
        source: entry.data.source,
        repeatable: entry.data.repeatable,
        lore: entry.data.lore,
        prerequisites: entry.data.prerequisites,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(feats).values(row).onConflictDoUpdate({
        target: feats.id,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          source: sql`excluded.source`,
          repeatable: sql`excluded.repeatable`,
          lore: sql`excluded.lore`,
          prerequisites: sql`excluded.prerequisites`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "race": {
      const row: typeof races.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        speed: entry.data.speed,
        requiresSubrace: entry.data.requiresSubrace,
        displayLabel: entry.data.displayLabel,
        lore: entry.data.lore,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(races).values(row).onConflictDoUpdate({
        target: races.id,
        set: {
          name: sql`excluded.name`,
          speed: sql`excluded.speed`,
          requiresSubrace: sql`excluded.requires_subrace`,
          displayLabel: sql`excluded.display_label`,
          lore: sql`excluded.lore`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "subrace": {
      const row: typeof subraces.$inferInsert = {
        id: entry.id,
        parentRaceId: entry.data.parentRaceId,
        name: entry.data.name,
        lore: entry.data.lore,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(subraces).values(row).onConflictDoUpdate({
        target: subraces.id,
        set: {
          parentRaceId: sql`excluded.parent_race_id`,
          name: sql`excluded.name`,
          lore: sql`excluded.lore`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "class": {
      const row: typeof classes.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        hitDie: entry.data.hitDie,
        subclassRequirementLevel: entry.data.subclassRequirementLevel,
        startingEquipment: entry.data.startingEquipment,
        multiclassPrerequisites: entry.data.multiclassPrerequisites,
        lore: entry.data.lore,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(classes).values(row).onConflictDoUpdate({
        target: classes.id,
        set: {
          name: sql`excluded.name`,
          hitDie: sql`excluded.hit_die`,
          subclassRequirementLevel: sql`excluded.subclass_req_level`,
          startingEquipment: sql`excluded.starting_equipment`,
          multiclassPrerequisites: sql`excluded.multiclass_prerequisites`,
          lore: sql`excluded.lore`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "subclass": {
      const row: typeof subclasses.$inferInsert = {
        id: entry.id,
        parentClassId: entry.data.parentClassId,
        name: entry.data.name,
        lore: entry.data.lore,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(subclasses).values(row).onConflictDoUpdate({
        target: subclasses.id,
        set: {
          parentClassId: sql`excluded.parent_class_id`,
          name: sql`excluded.name`,
          lore: sql`excluded.lore`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "background": {
      const row: typeof backgrounds.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        featureName: entry.data.featureName,
        featureDescription: entry.data.featureDescription,
        ideals: entry.data.ideals,
        bonds: entry.data.bonds,
        flaws: entry.data.flaws,
        personalityTraits: entry.data.personalityTraits,
        startingEquipment: entry.data.startingEquipment,
        lore: entry.data.lore,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(backgrounds).values(row).onConflictDoUpdate({
        target: backgrounds.id,
        set: {
          name: sql`excluded.name`,
          featureName: sql`excluded.feature_name`,
          featureDescription: sql`excluded.feature_description`,
          ideals: sql`excluded.ideals`,
          bonds: sql`excluded.bonds`,
          flaws: sql`excluded.flaws`,
          personalityTraits: sql`excluded.personality_traits`,
          startingEquipment: sql`excluded.starting_equipment`,
          lore: sql`excluded.lore`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "item": {
      const row: typeof items.$inferInsert = {
        id: entry.id,
        name: entry.data.name,
        weight: entry.data.weight,
        description: entry.data.description,
        isBundle: entry.data.isBundle,
        itemRule: entry.data.itemRule,
        weaponRule: entry.data.weaponRule,
        supersedesId: entry.supersedesId,
        ...scoped,
      };
      await tx.insert(items).values(row).onConflictDoUpdate({
        target: items.id,
        set: {
          name: sql`excluded.name`,
          weight: sql`excluded.weight`,
          description: sql`excluded.description`,
          isBundle: sql`excluded.is_bundle`,
          itemRule: sql`excluded.item_rule`,
          weaponRule: sql`excluded.weapon_rule`,
          sourceType: sql`excluded.source_type`,
          ownerCampaignId: sql`excluded.owner_campaign_id`,
          ownerCharacterId: sql`excluded.owner_character_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          isPublished: sql`excluded.is_published`,
          supersedesId: sql`excluded.supersedes_id`,
          packId: sql`excluded.pack_id`,
          packVersion: sql`excluded.pack_version`,
          publishedAt: sql`excluded.published_at`,
        },
      });
      return;
    }
    case "class_level": {
      const row: typeof classLevels.$inferInsert = {
        classId: entry.data.classId,
        level: entry.data.level,
        classSpecificScaling: entry.data.classSpecificScaling ?? null,
        spellcastingProgression: entry.data.spellcastingProgression ?? null,
      };
      await tx.insert(classLevels).values(row).onConflictDoUpdate({
        target: [classLevels.classId, classLevels.level],
        set: {
          classSpecificScaling: sql`excluded.class_specific_scaling`,
          spellcastingProgression: sql`excluded.spellcasting_progression`,
        },
      });
      return;
    }
    case "subclass_level": {
      const row: typeof subclassLevels.$inferInsert = {
        subclassId: entry.data.subclassId,
        level: entry.data.level,
        subclassSpecificScaling: entry.data.subclassSpecificScaling ?? null,
        bonusSpells: entry.data.bonusSpells ?? null,
        spellsAddedToList: entry.data.spellsAddedToList ?? null,
      };
      await tx.insert(subclassLevels).values(row).onConflictDoUpdate({
        target: [subclassLevels.subclassId, subclassLevels.level],
        set: {
          subclassSpecificScaling: sql`excluded.subclass_specific_scaling`,
          bonusSpells: sql`excluded.bonus_spells`,
          spellsAddedToList: sql`excluded.spells_added_to_list`,
        },
      });
      return;
    }
    default:
      throw new ImportPipelineError(`Unsupported import entity kind: ${String((entry as { kind?: unknown }).kind)}`);
  }
};

const applyRelationEntry = async (
  tx: typeof db,
  relation: ImportRelationEntry,
  run: ImportRunRow,
): Promise<void> => {
  const scoped = commonReferenceScopeForRun(run);

  if (relation.op === "remove") {
    switch (relation.kind) {
      case "feat_trait":
        await tx.delete(featTraits).where(and(eq(featTraits.featId, relation.featId), eq(featTraits.traitId, relation.traitId)));
        return;
      case "feat_prerequisite":
        await tx
          .delete(featPrerequisiteFeats)
          .where(and(eq(featPrerequisiteFeats.featId, relation.featId), eq(featPrerequisiteFeats.requiredFeatId, relation.requiredFeatId)));
        return;
      case "race_trait":
        await tx.delete(raceTraits).where(and(eq(raceTraits.raceId, relation.raceId), eq(raceTraits.traitId, relation.traitId)));
        return;
      case "subrace_trait":
        await tx
          .delete(subraceTraits)
          .where(and(eq(subraceTraits.subraceId, relation.subraceId), eq(subraceTraits.traitId, relation.traitId)));
        return;
      case "class_multiclass_trait":
        await tx
          .delete(classMulticlassTraits)
          .where(and(eq(classMulticlassTraits.classId, relation.classId), eq(classMulticlassTraits.traitId, relation.traitId)));
        return;
      case "class_progression":
        await tx
          .delete(classProgressions)
          .where(
            and(
              eq(classProgressions.classId, relation.classId),
              eq(classProgressions.level, relation.level),
              eq(classProgressions.traitId, relation.traitId),
            ),
          );
        return;
      case "subclass_progression":
        await tx
          .delete(subclassProgressions)
          .where(
            and(
              eq(subclassProgressions.subclassId, relation.subclassId),
              eq(subclassProgressions.level, relation.level),
              eq(subclassProgressions.traitId, relation.traitId),
            ),
          );
        return;
      case "background_trait":
        await tx
          .delete(backgroundTraits)
          .where(and(eq(backgroundTraits.backgroundId, relation.backgroundId), eq(backgroundTraits.traitId, relation.traitId)));
        return;
      case "bundle_content":
        await tx
          .delete(bundleContents)
          .where(and(eq(bundleContents.bundleId, relation.bundleId), eq(bundleContents.itemId, relation.itemId)));
        return;
      default:
        throw new ImportPipelineError(`Unsupported relation remove kind: ${String((relation as { kind?: unknown }).kind)}`);
    }
  }

  switch (relation.kind) {
    case "feat_trait":
      await tx.insert(featTraits).values({ featId: relation.featId, traitId: relation.traitId }).onConflictDoNothing();
      return;
    case "feat_prerequisite":
      await tx
        .insert(featPrerequisiteFeats)
        .values({ featId: relation.featId, requiredFeatId: relation.requiredFeatId })
        .onConflictDoNothing();
      return;
    case "race_trait":
      await tx.insert(raceTraits).values({ raceId: relation.raceId, traitId: relation.traitId }).onConflictDoNothing();
      return;
    case "subrace_trait":
      await tx
        .insert(subraceTraits)
        .values({ subraceId: relation.subraceId, traitId: relation.traitId })
        .onConflictDoNothing();
      return;
    case "class_multiclass_trait":
      await tx
        .insert(classMulticlassTraits)
        .values({ classId: relation.classId, traitId: relation.traitId })
        .onConflictDoNothing();
      return;
    case "class_progression":
      await tx
        .insert(classProgressions)
        .values({
          classId: relation.classId,
          level: relation.level,
          traitId: relation.traitId,
          ...scoped,
        })
        .onConflictDoUpdate({
          target: [classProgressions.classId, classProgressions.level, classProgressions.traitId],
          set: {
            sourceType: sql`excluded.source_type`,
            ownerCampaignId: sql`excluded.owner_campaign_id`,
            ownerCharacterId: sql`excluded.owner_character_id`,
            createdByUserId: sql`excluded.created_by_user_id`,
            isPublished: sql`excluded.is_published`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });
      return;
    case "subclass_progression":
      await tx
        .insert(subclassProgressions)
        .values({
          subclassId: relation.subclassId,
          level: relation.level,
          traitId: relation.traitId,
          ...scoped,
        })
        .onConflictDoUpdate({
          target: [
            subclassProgressions.subclassId,
            subclassProgressions.level,
            subclassProgressions.traitId,
          ],
          set: {
            sourceType: sql`excluded.source_type`,
            ownerCampaignId: sql`excluded.owner_campaign_id`,
            ownerCharacterId: sql`excluded.owner_character_id`,
            createdByUserId: sql`excluded.created_by_user_id`,
            isPublished: sql`excluded.is_published`,
            packId: sql`excluded.pack_id`,
            packVersion: sql`excluded.pack_version`,
            publishedAt: sql`excluded.published_at`,
          },
        });
      return;
    case "background_trait":
      await tx
        .insert(backgroundTraits)
        .values({ backgroundId: relation.backgroundId, traitId: relation.traitId })
        .onConflictDoNothing();
      return;
    case "bundle_content":
      await tx
        .insert(bundleContents)
        .values({
          bundleId: relation.bundleId,
          itemId: relation.itemId,
          quantity: relation.quantity,
        })
        .onConflictDoUpdate({
          target: [bundleContents.bundleId, bundleContents.itemId],
          set: {
            quantity: sql`excluded.quantity`,
          },
        });
      return;
    default:
      throw new ImportPipelineError(`Unsupported relation add kind: ${String((relation as { kind?: unknown }).kind)}`);
  }
};

export const stageImportRun = async ({
  payload,
  actorUserId,
}: {
  payload: unknown;
  actorUserId: string;
}): Promise<{ runId: string; status: string; totals: { entities: number; relations: number } }> => {
  const parsedPack = ImportPackSchema.parse(payload);
  await ensureImportPermissions(parsedPack, actorUserId);

  const [run] = await db
    .insert(importRuns)
    .values({
      packId: parsedPack.pack.packId,
      packVersion: 1,
      schemaVersion: parsedPack.pack.schemaVersion,
      sourceType: parsedPack.pack.sourceType,
      ownerCampaignId: parsedPack.pack.ownerCampaignId,
      ownerCharacterId: parsedPack.pack.ownerCharacterId,
      createdByUserId: parsedPack.pack.createdByUserId ?? actorUserId,
      publishMode: parsedPack.pack.publishMode,
      conflictPolicy: parsedPack.pack.conflictPolicy,
      idPolicy: parsedPack.pack.idPolicy,
      checksum: buildChecksum(parsedPack),
      status: "staged",
      totalEntityRows: parsedPack.entries.length,
      totalRelationRows: parsedPack.relations.length,
    })
    .returning({ id: importRuns.id, status: importRuns.status });

  if (!run) {
    throw new ImportPipelineError("Failed to create import run.");
  }

  const ledgerRows = [
    ...mapEntityRowsForLedger(run.id, parsedPack.entries),
    ...mapRelationRowsForLedger(run.id, parsedPack.relations, parsedPack.entries.length),
  ];

  if (ledgerRows.length > 0) {
    await db.insert(importRows).values(ledgerRows);
  }

  return {
    runId: run.id,
    status: run.status,
    totals: {
      entities: parsedPack.entries.length,
      relations: parsedPack.relations.length,
    },
  };
};

export const validateImportRun = async (runId: string): Promise<{
  runId: string;
  status: "validated" | "failed";
  totalIssues: number;
}> => {
  const operationStartedAt = Date.now();
  const run = await getRun(runId);
  const rows = await getRunRows(runId);

  const issues: ImportIssue[] = [];
  const parsedRows: ParsedLedgerRow[] = [];
  const rowFailureByIndex = new Map<number, string>();

  for (const row of rows) {
    try {
      if (row.rowType === "entity") {
        const entity = ImportEntityEntrySchema.parse(row.payload);
        if (entity.op === "supersede" && !entity.supersedesId) {
          throw new ImportPipelineError("supersede operation requires supersedesId.");
        }
        parsedRows.push({ row, entity });
      } else {
        const relation = ImportRelationEntrySchema.parse(row.payload);
        parsedRows.push({ row, relation });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed";
      rowFailureByIndex.set(row.rowIndex, message);
      issues.push({
        rowIndex: row.rowIndex,
        severity: "error",
        code: "ROW_VALIDATION_FAILED",
        message,
      });
    }
  }

  const fkIssues = await preflightRelationAndDependencyIssues(parsedRows);
  for (const issue of fkIssues) {
    issues.push(issue);
    if (issue.rowIndex !== undefined && !rowFailureByIndex.has(issue.rowIndex)) {
      rowFailureByIndex.set(issue.rowIndex, issue.message);
    }
  }

  for (const row of rows) {
    const failureMessage = rowFailureByIndex.get(row.rowIndex);
    if (failureMessage) {
      await updateLedgerRowStatus(runId, row.rowIndex, "failed", failureMessage);
      continue;
    }
    await updateLedgerRowStatus(runId, row.rowIndex, "validated");
  }

  await markRunIssues(runId, issues);
  const status = issues.length > 0 ? "failed" : "validated";

  await db
    .update(importRuns)
    .set({
      status,
      totalIssues: issues.length,
      completedAt: status === "failed" ? new Date() : null,
      validateDurationMs: Math.max(0, Date.now() - operationStartedAt),
      totalDurationMs: status === "failed" ? totalDurationFromStagedAt(run) : null,
    })
    .where(eq(importRuns.id, run.id));

  return {
    runId: run.id,
    status,
    totalIssues: issues.length,
  };
};

export const planImportRun = async (runId: string): Promise<ImportPlanSummary> => {
  const operationStartedAt = Date.now();
  const run = await getRun(runId);
  if (run.status !== "validated" && run.status !== "planned") {
    throw new ImportPipelineError("Run must be validated before planning.");
  }

  const rows = await getRunRows(runId);
  const summary: ImportPlanSummary = {
    runId,
    status: "planned",
    insertCount: 0,
    updateCount: 0,
    archiveCount: 0,
    relationAddCount: 0,
    relationRemoveCount: 0,
    skipCount: 0,
  };

  const issues: ImportIssue[] = [];
  const parsedRows: ParsedLedgerRow[] = [];

  for (const row of rows) {
    if (row.rowType === "relation") {
      const relation = ImportRelationEntrySchema.parse(row.payload);
      parsedRows.push({ row, relation });
      if (relation.op === "add") summary.relationAddCount += 1;
      else summary.relationRemoveCount += 1;
      continue;
    }

    const entity = ImportEntityEntrySchema.parse(row.payload);
    parsedRows.push({ row, entity });
    const exists = await entityExists(entity);

    if (entity.op === "archive") {
      if (exists) summary.archiveCount += 1;
      else summary.skipCount += 1;
      continue;
    }

    if (!exists) {
      summary.insertCount += 1;
      continue;
    }

    if (entity.op === "insert" && run.conflictPolicy === "skip_existing") {
      summary.skipCount += 1;
      issues.push({
        rowIndex: row.rowIndex,
        severity: "warning",
        code: "SKIP_EXISTING",
        message: `Entity ${entity.kind}:${entity.id} already exists and will be skipped.`,
      });
      continue;
    }

    if (entity.op === "insert" && run.conflictPolicy === "fail") {
      issues.push({
        rowIndex: row.rowIndex,
        severity: "error",
        code: "CONFLICT_FAIL_POLICY",
        message: `Entity ${entity.kind}:${entity.id} already exists and conflictPolicy is fail.`,
      });
      continue;
    }

    summary.updateCount += 1;
  }

  const fkIssues = await preflightRelationAndDependencyIssues(parsedRows);
  issues.push(...fkIssues);

  for (const issue of fkIssues) {
    if (issue.rowIndex === undefined) continue;
    await updateLedgerRowStatus(runId, issue.rowIndex, "failed", issue.message);
  }

  await markRunIssues(runId, issues);

  const hasErrors = issues.some((issue) => issue.severity === "error");
  await db
    .update(importRuns)
    .set({
      status: hasErrors ? "failed" : "planned",
      totalIssues: issues.length,
      completedAt: hasErrors ? new Date() : null,
      planDurationMs: Math.max(0, Date.now() - operationStartedAt),
      totalDurationMs: hasErrors ? totalDurationFromStagedAt(run) : null,
    })
    .where(eq(importRuns.id, runId));

  if (hasErrors) {
    throw new ImportPipelineError("Planning detected blocking conflicts.");
  }

  return summary;
};

export const applyImportRun = async (runId: string): Promise<{ runId: string; status: "applied" }> => {
  const operationStartedAt = Date.now();
  const run = await getRun(runId);
  if (run.status !== "validated" && run.status !== "planned") {
    throw new ImportPipelineError("Run must be validated or planned before apply.");
  }

  const rows = await getRunRows(runId);
  const appliedRowCountsByKind: Record<string, number> = {};

  try {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        if (row.rowType === "entity") {
          const entity = ImportEntityEntrySchema.parse(row.payload);
          const exists = await entityExists(entity);

          if (entity.op === "insert" && exists) {
            if (run.conflictPolicy === "skip_existing") {
              await updateLedgerRowStatus(runId, row.rowIndex, "skipped");
              continue;
            }

            if (run.conflictPolicy === "fail") {
              throw new ImportPipelineError(
                `Conflict detected for ${entity.kind}:${entity.id} with fail policy.`,
              );
            }
          }

          await applyEntityEntry(tx, entity, run);
          await updateLedgerRowStatus(runId, row.rowIndex, "applied");
          appliedRowCountsByKind[row.kind] = (appliedRowCountsByKind[row.kind] ?? 0) + 1;
          continue;
        }

        const relation = ImportRelationEntrySchema.parse(row.payload);
        await applyRelationEntry(tx, relation, run);
        await updateLedgerRowStatus(runId, row.rowIndex, "applied");
        appliedRowCountsByKind[row.kind] = (appliedRowCountsByKind[row.kind] ?? 0) + 1;
      }

      await tx
        .update(importRuns)
        .set({
          status: "applied",
          completedAt: new Date(),
          applyDurationMs: Math.max(0, Date.now() - operationStartedAt),
          totalDurationMs: totalDurationFromStagedAt(run),
          appliedRowCountsByKind,
        })
        .where(eq(importRuns.id, runId));
    });
  } catch (error) {
    await db
      .update(importRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        applyDurationMs: Math.max(0, Date.now() - operationStartedAt),
        totalDurationMs: totalDurationFromStagedAt(run),
      })
      .where(eq(importRuns.id, runId));

    await markRunIssues(runId, [
      {
        severity: "error",
        code: "APPLY_FAILED",
        message: error instanceof Error ? error.message : "Import apply failed.",
      },
    ]);

    throw error;
  }

  invalidateReferenceCache();
  invalidateRuleSnapshotCache();

  return { runId, status: "applied" };
};

export const publishImportRun = async (runId: string): Promise<{ runId: string; publishedRows: number }> => {
  const operationStartedAt = Date.now();
  const run = await getRun(runId);
  if (run.status !== "applied") {
    throw new ImportPipelineError("Run must be applied before publish.");
  }

  const rows = await getRunRows(runId);
  const now = new Date();

  const entityRows = rows.filter((row) => row.rowType === "entity");
  const entities = entityRows.map((row) => ImportEntityEntrySchema.parse(row.payload));

  const idsByKind = new Map<string, string[]>();
  for (const entity of entities) {
    const ids = idsByKind.get(entity.kind) ?? [];
    ids.push(entity.id);
    idsByKind.set(entity.kind, ids);
  }

  const publishSet = { isPublished: true, publishedAt: now };

  if ((idsByKind.get("trait") ?? []).length > 0) {
    await db
      .update(traits)
      .set(publishSet)
      .where(inArray(traits.id, idsByKind.get("trait")!));
  }

  if ((idsByKind.get("feat") ?? []).length > 0) {
    await db
      .update(feats)
      .set(publishSet)
      .where(inArray(feats.id, idsByKind.get("feat")!));
  }

  if ((idsByKind.get("race") ?? []).length > 0) {
    await db
      .update(races)
      .set(publishSet)
      .where(inArray(races.id, idsByKind.get("race")!));
  }

  if ((idsByKind.get("subrace") ?? []).length > 0) {
    await db
      .update(subraces)
      .set(publishSet)
      .where(inArray(subraces.id, idsByKind.get("subrace")!));
  }

  if ((idsByKind.get("class") ?? []).length > 0) {
    await db
      .update(classes)
      .set(publishSet)
      .where(inArray(classes.id, idsByKind.get("class")!));
  }

  if ((idsByKind.get("subclass") ?? []).length > 0) {
    await db
      .update(subclasses)
      .set(publishSet)
      .where(inArray(subclasses.id, idsByKind.get("subclass")!));
  }

  if ((idsByKind.get("background") ?? []).length > 0) {
    await db
      .update(backgrounds)
      .set(publishSet)
      .where(inArray(backgrounds.id, idsByKind.get("background")!));
  }

  if ((idsByKind.get("item") ?? []).length > 0) {
    await db
      .update(items)
      .set(publishSet)
      .where(inArray(items.id, idsByKind.get("item")!));
  }

  await db
    .update(classProgressions)
    .set({ isPublished: true, publishedAt: now })
    .where(eq(classProgressions.packId, run.packId));

  await db
    .update(subclassProgressions)
    .set({ isPublished: true, publishedAt: now })
    .where(eq(subclassProgressions.packId, run.packId));

  await db
    .update(importRuns)
    .set({
      completedAt: now,
      publishDurationMs: Math.max(0, Date.now() - operationStartedAt),
      totalDurationMs: totalDurationFromStagedAt(run),
    })
    .where(eq(importRuns.id, runId));

  invalidateReferenceCache();
  invalidateRuleSnapshotCache();

  return {
    runId,
    publishedRows: entityRows.length,
  };
};

export const getImportRunSummary = async (runId: string): Promise<{
  run: ImportRunRow;
  rowCounts: Record<string, number>;
  issues: Array<typeof importIssues.$inferSelect>;
}> => {
  const run = await getRun(runId);
  const rows = await getRunRows(runId);
  const issues = await db
    .select()
    .from(importIssues)
    .where(eq(importIssues.runId, runId));

  const rowCounts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.rowType}:${row.status}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return { run, rowCounts, issues };
};

export { ImportPipelineError };
