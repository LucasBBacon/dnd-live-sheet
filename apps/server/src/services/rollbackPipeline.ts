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
  importRows,
  importRuns,
  items,
  raceTraits,
  races,
  rollbackIssues,
  rollbackRows,
  rollbackRuns,
  subraceTraits,
  subraces,
  subclassLevels,
  subclassProgressions,
  subclasses,
  traits,
} from "@project/database/src/schema/reference.js";
import {
  ImportEntityEntrySchema,
  ImportRelationEntrySchema,
  type ImportEntityEntry,
  type ImportRelationEntry,
} from "@project/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { invalidateReferenceCache } from "./referenceCache.js";
import { invalidateRuleSnapshotCache } from "./ruleSnapshotCache.js";

type ImportRunRow = typeof importRuns.$inferSelect;
type ImportRowRow = typeof importRows.$inferSelect;
type RollbackRunRow = typeof rollbackRuns.$inferSelect;
type RollbackRowRow = typeof rollbackRows.$inferSelect;

type RollbackIssue = {
  rowIndex?: number;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  details?: unknown;
};

type RollbackPlannedRow = {
  sourceRowIndex: number;
  rowType: "entity" | "relation";
  kind: string;
  op: string;
  entityId: string | null;
  payload: unknown;
};

type RollbackKind =
  | "trait"
  | "feat"
  | "race"
  | "subrace"
  | "class"
  | "subclass"
  | "background"
  | "item";

type ExistingReferenceResolver = (kind: RollbackKind, id: string) => Promise<boolean> | boolean;

export class RollbackPipelineError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RollbackPipelineError";
    this.statusCode = statusCode;
  }
}

const getImportRun = async (sourceRunId: string): Promise<ImportRunRow> => {
  const [run] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.id, sourceRunId))
    .limit(1);

  if (!run) {
    throw new RollbackPipelineError("Source import run not found.", 404);
  }

  return run;
};

const getRollbackRun = async (rollbackRunId: string): Promise<RollbackRunRow> => {
  const [run] = await db
    .select()
    .from(rollbackRuns)
    .where(eq(rollbackRuns.id, rollbackRunId))
    .limit(1);

  if (!run) {
    throw new RollbackPipelineError("Rollback run not found.", 404);
  }

  return run;
};

const getRollbackRows = async (rollbackRunId: string): Promise<RollbackRowRow[]> =>
  db
    .select()
    .from(rollbackRows)
    .where(eq(rollbackRows.runId, rollbackRunId))
    .orderBy(rollbackRows.rowIndex);

const rollbackTotalDurationFromPlannedAt = (run: RollbackRunRow): number =>
  Math.max(0, Date.now() - run.plannedAt.getTime());

const getAppliedSourceRows = async (sourceRunId: string): Promise<ImportRowRow[]> =>
  db
    .select()
    .from(importRows)
    .where(and(eq(importRows.runId, sourceRunId), eq(importRows.status, "applied")))
    .orderBy(desc(importRows.rowIndex));

const invertEntityForRollback = (
  entity: ImportEntityEntry,
): { op: string; payload: ImportEntityEntry } | { error: string } => {
  if (entity.kind === "class_level" || entity.kind === "subclass_level") {
    return {
      op: "delete",
      payload: entity,
    };
  }

  if (entity.op === "archive") {
    return {
      error: `Rollback for archived entity ${entity.kind}:${entity.id} requires historical snapshot support.`,
    };
  }

  return {
    op: "archive",
    payload: {
      ...entity,
      op: "archive",
    },
  };
};

const invertRelationForRollback = (
  relation: ImportRelationEntry,
): { op: string; payload: ImportRelationEntry } => ({
  op: relation.op === "add" ? "remove" : "add",
  payload: {
    ...relation,
    op: relation.op === "add" ? "remove" : "add",
  },
});

export const buildRollbackPlanRows = (
  sourceRows: ImportRowRow[],
): { plannedRows: RollbackPlannedRow[]; issues: RollbackIssue[] } => {
  const plannedRows: RollbackPlannedRow[] = [];
  const issues: RollbackIssue[] = [];

  for (const sourceRow of sourceRows) {
    try {
      if (sourceRow.rowType === "entity") {
        const entity = ImportEntityEntrySchema.parse(sourceRow.payload);
        const inverse = invertEntityForRollback(entity);

        if ("error" in inverse) {
          issues.push({
            severity: "error",
            code: "UNSUPPORTED_ROLLBACK_INVERSE",
            message: inverse.error,
            details: {
              sourceRowIndex: sourceRow.rowIndex,
              kind: sourceRow.kind,
              op: sourceRow.op,
            },
          });
          continue;
        }

        plannedRows.push({
          sourceRowIndex: sourceRow.rowIndex,
          rowType: "entity",
          kind: sourceRow.kind,
          op: inverse.op,
          entityId: sourceRow.entityId ?? null,
          payload: inverse.payload,
        });
        continue;
      }

      const relation = ImportRelationEntrySchema.parse(sourceRow.payload);
      const inverse = invertRelationForRollback(relation);

      plannedRows.push({
        sourceRowIndex: sourceRow.rowIndex,
        rowType: "relation",
        kind: sourceRow.kind,
        op: inverse.op,
        entityId: sourceRow.entityId ?? null,
        payload: inverse.payload,
      });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "ROLLBACK_ROW_PARSE_FAILED",
        message: error instanceof Error ? error.message : "Rollback row parse failed.",
        details: {
          sourceRowIndex: sourceRow.rowIndex,
          kind: sourceRow.kind,
          op: sourceRow.op,
        },
      });
    }
  }

  return {
    plannedRows,
    issues,
  };
};

const fetchExistingIds = async (kind: RollbackKind, ids: Set<string>): Promise<Set<string>> => {
  if (ids.size === 0) return new Set<string>();

  const idList = [...ids];

  switch (kind) {
    case "trait": {
      const rows = await db.select({ id: traits.id }).from(traits).where(inArray(traits.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "feat": {
      const rows = await db.select({ id: feats.id }).from(feats).where(inArray(feats.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    case "race": {
      const rows = await db.select({ id: races.id }).from(races).where(inArray(races.id, idList));
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
      const rows = await db.select({ id: classes.id }).from(classes).where(inArray(classes.id, idList));
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
      const rows = await db.select({ id: items.id }).from(items).where(inArray(items.id, idList));
      return new Set(rows.map((row) => row.id));
    }
    default:
      return new Set<string>();
  }
};

const collectRelationAddReferenceIds = (plannedRows: RollbackPlannedRow[]) => {
  const referenced = {
    trait: new Set<string>(),
    feat: new Set<string>(),
    race: new Set<string>(),
    subrace: new Set<string>(),
    class: new Set<string>(),
    subclass: new Set<string>(),
    background: new Set<string>(),
    item: new Set<string>(),
  };

  for (const row of plannedRows) {
    if (row.rowType !== "relation" || row.op !== "add") continue;

    const relation = ImportRelationEntrySchema.parse(row.payload);

    switch (relation.kind) {
      case "feat_trait":
        referenced.feat.add(relation.featId);
        referenced.trait.add(relation.traitId);
        break;
      case "feat_prerequisite":
        referenced.feat.add(relation.featId);
        referenced.feat.add(relation.requiredFeatId);
        break;
      case "race_trait":
        referenced.race.add(relation.raceId);
        referenced.trait.add(relation.traitId);
        break;
      case "subrace_trait":
        referenced.subrace.add(relation.subraceId);
        referenced.trait.add(relation.traitId);
        break;
      case "class_multiclass_trait":
        referenced.class.add(relation.classId);
        referenced.trait.add(relation.traitId);
        break;
      case "class_progression":
        referenced.class.add(relation.classId);
        referenced.trait.add(relation.traitId);
        break;
      case "subclass_progression":
        referenced.subclass.add(relation.subclassId);
        referenced.trait.add(relation.traitId);
        break;
      case "background_trait":
        referenced.background.add(relation.backgroundId);
        referenced.trait.add(relation.traitId);
        break;
      case "bundle_content":
        referenced.item.add(relation.bundleId);
        referenced.item.add(relation.itemId);
        break;
      default:
        break;
    }
  }

  return referenced;
};

export const preflightRollbackPlanRows = async (
  plannedRows: RollbackPlannedRow[],
  resolveExistingReference?: ExistingReferenceResolver,
): Promise<RollbackIssue[]> => {
  const issues: RollbackIssue[] = [];

  if (resolveExistingReference) {
    const pushMissing = async (rowIndex: number, kind: RollbackKind, id: string, context: string) => {
      if (await resolveExistingReference(kind, id)) return;
      issues.push({
        rowIndex,
        severity: "error",
        code: "ROLLBACK_PREFLIGHT_MISSING_REFERENCE",
        message: `${context} references missing ${kind} id: ${id}.`,
        details: { kind, id, context },
      });
    };

    for (const [rowIndex, row] of plannedRows.entries()) {
      if (row.rowType !== "relation" || row.op !== "add") continue;

      const relation = ImportRelationEntrySchema.parse(row.payload);

      switch (relation.kind) {
        case "feat_trait":
          await pushMissing(rowIndex, "feat", relation.featId, "feat_trait.featId");
          await pushMissing(rowIndex, "trait", relation.traitId, "feat_trait.traitId");
          break;
        case "feat_prerequisite":
          await pushMissing(rowIndex, "feat", relation.featId, "feat_prerequisite.featId");
          await pushMissing(rowIndex, "feat", relation.requiredFeatId, "feat_prerequisite.requiredFeatId");
          break;
        case "race_trait":
          await pushMissing(rowIndex, "race", relation.raceId, "race_trait.raceId");
          await pushMissing(rowIndex, "trait", relation.traitId, "race_trait.traitId");
          break;
        case "subrace_trait":
          await pushMissing(rowIndex, "subrace", relation.subraceId, "subrace_trait.subraceId");
          await pushMissing(rowIndex, "trait", relation.traitId, "subrace_trait.traitId");
          break;
        case "class_multiclass_trait":
          await pushMissing(rowIndex, "class", relation.classId, "class_multiclass_trait.classId");
          await pushMissing(rowIndex, "trait", relation.traitId, "class_multiclass_trait.traitId");
          break;
        case "class_progression":
          await pushMissing(rowIndex, "class", relation.classId, "class_progression.classId");
          await pushMissing(rowIndex, "trait", relation.traitId, "class_progression.traitId");
          break;
        case "subclass_progression":
          await pushMissing(rowIndex, "subclass", relation.subclassId, "subclass_progression.subclassId");
          await pushMissing(rowIndex, "trait", relation.traitId, "subclass_progression.traitId");
          break;
        case "background_trait":
          await pushMissing(rowIndex, "background", relation.backgroundId, "background_trait.backgroundId");
          await pushMissing(rowIndex, "trait", relation.traitId, "background_trait.traitId");
          break;
        case "bundle_content":
          await pushMissing(rowIndex, "item", relation.bundleId, "bundle_content.bundleId");
          await pushMissing(rowIndex, "item", relation.itemId, "bundle_content.itemId");
          break;
        default:
          break;
      }
    }

    return issues;
  }

  const referenced = collectRelationAddReferenceIds(plannedRows);

  const [existingTraits, existingFeats, existingRaces, existingSubraces, existingClasses, existingSubclasses, existingBackgrounds, existingItems] =
    await Promise.all([
      fetchExistingIds("trait", referenced.trait),
      fetchExistingIds("feat", referenced.feat),
      fetchExistingIds("race", referenced.race),
      fetchExistingIds("subrace", referenced.subrace),
      fetchExistingIds("class", referenced.class),
      fetchExistingIds("subclass", referenced.subclass),
      fetchExistingIds("background", referenced.background),
      fetchExistingIds("item", referenced.item),
    ]);

  const exists = (kind: RollbackKind, id: string): boolean => {
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

  const pushMissing = (rowIndex: number, kind: RollbackKind, id: string, context: string) => {
    if (exists(kind, id)) return;
    issues.push({
      rowIndex,
      severity: "error",
      code: "ROLLBACK_PREFLIGHT_MISSING_REFERENCE",
      message: `${context} references missing ${kind} id: ${id}.`,
      details: { kind, id, context },
    });
  };

  for (const [rowIndex, row] of plannedRows.entries()) {
    if (row.rowType !== "relation" || row.op !== "add") continue;

    const relation = ImportRelationEntrySchema.parse(row.payload);

    switch (relation.kind) {
      case "feat_trait":
        pushMissing(rowIndex, "feat", relation.featId, "feat_trait.featId");
        pushMissing(rowIndex, "trait", relation.traitId, "feat_trait.traitId");
        break;
      case "feat_prerequisite":
        pushMissing(rowIndex, "feat", relation.featId, "feat_prerequisite.featId");
        pushMissing(rowIndex, "feat", relation.requiredFeatId, "feat_prerequisite.requiredFeatId");
        break;
      case "race_trait":
        pushMissing(rowIndex, "race", relation.raceId, "race_trait.raceId");
        pushMissing(rowIndex, "trait", relation.traitId, "race_trait.traitId");
        break;
      case "subrace_trait":
        pushMissing(rowIndex, "subrace", relation.subraceId, "subrace_trait.subraceId");
        pushMissing(rowIndex, "trait", relation.traitId, "subrace_trait.traitId");
        break;
      case "class_multiclass_trait":
        pushMissing(rowIndex, "class", relation.classId, "class_multiclass_trait.classId");
        pushMissing(rowIndex, "trait", relation.traitId, "class_multiclass_trait.traitId");
        break;
      case "class_progression":
        pushMissing(rowIndex, "class", relation.classId, "class_progression.classId");
        pushMissing(rowIndex, "trait", relation.traitId, "class_progression.traitId");
        break;
      case "subclass_progression":
        pushMissing(rowIndex, "subclass", relation.subclassId, "subclass_progression.subclassId");
        pushMissing(rowIndex, "trait", relation.traitId, "subclass_progression.traitId");
        break;
      case "background_trait":
        pushMissing(rowIndex, "background", relation.backgroundId, "background_trait.backgroundId");
        pushMissing(rowIndex, "trait", relation.traitId, "background_trait.traitId");
        break;
      case "bundle_content":
        pushMissing(rowIndex, "item", relation.bundleId, "bundle_content.bundleId");
        pushMissing(rowIndex, "item", relation.itemId, "bundle_content.itemId");
        break;
      default:
        break;
    }
  }

  return issues;
};

const markRollbackIssues = async (rollbackRunId: string, issues: RollbackIssue[]): Promise<void> => {
  await db.delete(rollbackIssues).where(eq(rollbackIssues.runId, rollbackRunId));
  if (issues.length === 0) return;

  await db.insert(rollbackIssues).values(
    issues.map((issue) => ({
      runId: rollbackRunId,
      rowIndex: issue.rowIndex,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      details: issue.details,
    })),
  );
};

const updateRollbackRowStatus = async (
  rollbackRunId: string,
  rowIndex: number,
  status: "pending" | "planned" | "applied" | "failed" | "skipped",
  errorMessage?: string,
): Promise<void> => {
  await db
    .update(rollbackRows)
    .set({ status, errorMessage: errorMessage ?? null })
    .where(and(eq(rollbackRows.runId, rollbackRunId), eq(rollbackRows.rowIndex, rowIndex)));
};

const rollbackScopeForSourceRun = (sourceRun: ImportRunRow) => ({
  sourceType: sourceRun.sourceType,
  ownerCampaignId: sourceRun.ownerCampaignId,
  ownerCharacterId: sourceRun.ownerCharacterId,
  createdByUserId: sourceRun.createdByUserId,
  isPublished: sourceRun.publishMode === "published",
  packId: sourceRun.packId,
  packVersion: sourceRun.packVersion,
  publishedAt: sourceRun.publishMode === "published" ? new Date() : null,
});

const applyRollbackEntity = async (entry: ImportEntityEntry): Promise<void> => {
  if (entry.op === "archive") {
    switch (entry.kind) {
      case "trait":
        await db.update(traits).set({ isPublished: false, publishedAt: null }).where(eq(traits.id, entry.id));
        return;
      case "feat":
        await db.update(feats).set({ isPublished: false, publishedAt: null }).where(eq(feats.id, entry.id));
        return;
      case "race":
        await db.update(races).set({ isPublished: false, publishedAt: null }).where(eq(races.id, entry.id));
        return;
      case "subrace":
        await db
          .update(subraces)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(subraces.id, entry.id));
        return;
      case "class":
        await db.update(classes).set({ isPublished: false, publishedAt: null }).where(eq(classes.id, entry.id));
        return;
      case "subclass":
        await db
          .update(subclasses)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(subclasses.id, entry.id));
        return;
      case "background":
        await db
          .update(backgrounds)
          .set({ isPublished: false, publishedAt: null })
          .where(eq(backgrounds.id, entry.id));
        return;
      case "item":
        await db.update(items).set({ isPublished: false, publishedAt: null }).where(eq(items.id, entry.id));
        return;
      default:
        throw new RollbackPipelineError(`Unsupported rollback archive kind: ${entry.kind}.`);
    }
  }

  if (entry.op === "delete") {
    switch (entry.kind) {
      case "class_level":
        await db
          .delete(classLevels)
          .where(and(eq(classLevels.classId, entry.data.classId), eq(classLevels.level, entry.data.level)));
        return;
      case "subclass_level":
        await db
          .delete(subclassLevels)
          .where(
            and(
              eq(subclassLevels.subclassId, entry.data.subclassId),
              eq(subclassLevels.level, entry.data.level),
            ),
          );
        return;
      default:
        throw new RollbackPipelineError(`Unsupported rollback delete kind: ${entry.kind}.`);
    }
  }

  throw new RollbackPipelineError(`Unsupported rollback entity op: ${entry.op}.`);
};

const applyRollbackRelation = async (relation: ImportRelationEntry, sourceRun: ImportRunRow): Promise<void> => {
  const scoped = rollbackScopeForSourceRun(sourceRun);

  if (relation.op === "remove") {
    switch (relation.kind) {
      case "feat_trait":
        await db
          .delete(featTraits)
          .where(and(eq(featTraits.featId, relation.featId), eq(featTraits.traitId, relation.traitId)));
        return;
      case "feat_prerequisite":
        await db
          .delete(featPrerequisiteFeats)
          .where(
            and(
              eq(featPrerequisiteFeats.featId, relation.featId),
              eq(featPrerequisiteFeats.requiredFeatId, relation.requiredFeatId),
            ),
          );
        return;
      case "race_trait":
        await db
          .delete(raceTraits)
          .where(and(eq(raceTraits.raceId, relation.raceId), eq(raceTraits.traitId, relation.traitId)));
        return;
      case "subrace_trait":
        await db
          .delete(subraceTraits)
          .where(and(eq(subraceTraits.subraceId, relation.subraceId), eq(subraceTraits.traitId, relation.traitId)));
        return;
      case "class_multiclass_trait":
        await db
          .delete(classMulticlassTraits)
          .where(
            and(
              eq(classMulticlassTraits.classId, relation.classId),
              eq(classMulticlassTraits.traitId, relation.traitId),
            ),
          );
        return;
      case "class_progression":
        await db
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
        await db
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
        await db
          .delete(backgroundTraits)
          .where(
            and(
              eq(backgroundTraits.backgroundId, relation.backgroundId),
              eq(backgroundTraits.traitId, relation.traitId),
            ),
          );
        return;
      case "bundle_content":
        await db
          .delete(bundleContents)
          .where(and(eq(bundleContents.bundleId, relation.bundleId), eq(bundleContents.itemId, relation.itemId)));
        return;
      default:
        throw new RollbackPipelineError(`Unsupported rollback relation remove kind: ${relation.kind}.`);
    }
  }

  if (relation.op === "add") {
    switch (relation.kind) {
      case "feat_trait":
        await db.insert(featTraits).values({ featId: relation.featId, traitId: relation.traitId }).onConflictDoNothing();
        return;
      case "feat_prerequisite":
        await db
          .insert(featPrerequisiteFeats)
          .values({ featId: relation.featId, requiredFeatId: relation.requiredFeatId })
          .onConflictDoNothing();
        return;
      case "race_trait":
        await db.insert(raceTraits).values({ raceId: relation.raceId, traitId: relation.traitId }).onConflictDoNothing();
        return;
      case "subrace_trait":
        await db
          .insert(subraceTraits)
          .values({ subraceId: relation.subraceId, traitId: relation.traitId })
          .onConflictDoNothing();
        return;
      case "class_multiclass_trait":
        await db
          .insert(classMulticlassTraits)
          .values({ classId: relation.classId, traitId: relation.traitId })
          .onConflictDoNothing();
        return;
      case "class_progression":
        await db
          .insert(classProgressions)
          .values({
            classId: relation.classId,
            level: relation.level,
            traitId: relation.traitId,
            ...scoped,
          })
          .onConflictDoNothing();
        return;
      case "subclass_progression":
        await db
          .insert(subclassProgressions)
          .values({
            subclassId: relation.subclassId,
            level: relation.level,
            traitId: relation.traitId,
            ...scoped,
          })
          .onConflictDoNothing();
        return;
      case "background_trait":
        await db
          .insert(backgroundTraits)
          .values({ backgroundId: relation.backgroundId, traitId: relation.traitId })
          .onConflictDoNothing();
        return;
      case "bundle_content":
        await db
          .insert(bundleContents)
          .values({ bundleId: relation.bundleId, itemId: relation.itemId, quantity: relation.quantity })
          .onConflictDoNothing();
        return;
      default:
        throw new RollbackPipelineError(`Unsupported rollback relation add kind: ${relation.kind}.`);
    }
  }

  throw new RollbackPipelineError(`Unsupported rollback relation op: ${relation.op}.`);
};

export const planRollbackRun = async ({
  sourceRunId,
  initiatedByUserId,
}: {
  sourceRunId: string;
  initiatedByUserId?: string;
}): Promise<{ rollbackRunId: string; status: "planned"; totalRows: number; totalIssues: number }> => {
  const startedAt = Date.now();
  const sourceRun = await getImportRun(sourceRunId);

  if (sourceRun.status !== "applied") {
    throw new RollbackPipelineError("Only applied import runs can be planned for rollback.");
  }

  const sourceRows = await getAppliedSourceRows(sourceRunId);

  const [run] = await db
    .insert(rollbackRuns)
    .values({
      sourceRunId,
      initiatedByUserId,
      status: "planned",
      totalRows: sourceRows.length,
    })
    .returning({ id: rollbackRuns.id, plannedAt: rollbackRuns.plannedAt });

  if (!run) {
    throw new RollbackPipelineError("Failed to create rollback run.");
  }

  const issues: RollbackIssue[] = [];

  if (sourceRows.length === 0) {
    issues.push({
      severity: "error",
      code: "ROLLBACK_NO_APPLIED_ROWS",
      message: "Source run has no applied rows to rollback.",
    });
  }

  const built = buildRollbackPlanRows(sourceRows);
  issues.push(...built.issues);

  const preflightIssues = await preflightRollbackPlanRows(built.plannedRows);
  issues.push(...preflightIssues);

  const failingRowIndexes = new Set<number>(
    issues.filter((issue) => issue.rowIndex !== undefined).map((issue) => issue.rowIndex as number),
  );

  if (built.plannedRows.length > 0) {
    await db.insert(rollbackRows).values(
      built.plannedRows.map((row, rowIndex) => ({
        runId: run.id,
        rowIndex,
        sourceRowIndex: row.sourceRowIndex,
        rowType: row.rowType,
        kind: row.kind,
        op: row.op,
        entityId: row.entityId,
        payload: row.payload,
        status: failingRowIndexes.has(rowIndex) ? "failed" : "planned",
        errorMessage: null,
      })),
    );
  }

  await markRollbackIssues(run.id, issues);

  const hasErrors = issues.some((issue) => issue.severity === "error");

  await db
    .update(rollbackRuns)
    .set({
      status: hasErrors ? "failed" : "planned",
      totalRows: built.plannedRows.length,
      totalIssues: issues.length,
      planDurationMs: Math.max(0, Date.now() - startedAt),
      totalDurationMs: hasErrors ? Math.max(0, Date.now() - run.plannedAt.getTime()) : null,
      completedAt: hasErrors ? new Date() : null,
    })
    .where(eq(rollbackRuns.id, run.id));

  if (hasErrors) {
    throw new RollbackPipelineError("Rollback planning detected blocking issues.");
  }

  return {
    rollbackRunId: run.id,
    status: "planned",
    totalRows: built.plannedRows.length,
    totalIssues: issues.length,
  };
};

export const applyRollbackRun = async (
  rollbackRunId: string,
): Promise<{ rollbackRunId: string; status: "applied"; appliedRows: number; skippedRows: number }> => {
  const startedAt = Date.now();
  const run = await getRollbackRun(rollbackRunId);

  if (run.status !== "planned") {
    throw new RollbackPipelineError("Rollback run must be planned before apply.");
  }

  const sourceRun = await getImportRun(run.sourceRunId);
  const rows = await getRollbackRows(rollbackRunId);
  const appliedRowCountsByKind: Record<string, number> = {};
  let appliedRows = 0;
  let skippedRows = 0;

  try {
    for (const row of rows) {
      if (row.status === "failed") {
        skippedRows += 1;
        continue;
      }

      if (row.rowType === "entity") {
        const entity = ImportEntityEntrySchema.parse(row.payload);
        await applyRollbackEntity(entity);
        await updateRollbackRowStatus(rollbackRunId, row.rowIndex, "applied");
        appliedRowCountsByKind[row.kind] = (appliedRowCountsByKind[row.kind] ?? 0) + 1;
        appliedRows += 1;
        continue;
      }

      const relation = ImportRelationEntrySchema.parse(row.payload);
      await applyRollbackRelation(relation, sourceRun);
      await updateRollbackRowStatus(rollbackRunId, row.rowIndex, "applied");
      appliedRowCountsByKind[row.kind] = (appliedRowCountsByKind[row.kind] ?? 0) + 1;
      appliedRows += 1;
    }

    await db
      .update(rollbackRuns)
      .set({
        status: "applied",
        completedAt: new Date(),
        applyDurationMs: Math.max(0, Date.now() - startedAt),
        totalDurationMs: rollbackTotalDurationFromPlannedAt(run),
        appliedRowCountsByKind,
      })
      .where(eq(rollbackRuns.id, rollbackRunId));
  } catch (error) {
    await db
      .update(rollbackRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        applyDurationMs: Math.max(0, Date.now() - startedAt),
        totalDurationMs: rollbackTotalDurationFromPlannedAt(run),
      })
      .where(eq(rollbackRuns.id, rollbackRunId));

    await markRollbackIssues(rollbackRunId, [
      {
        severity: "error",
        code: "ROLLBACK_APPLY_FAILED",
        message: error instanceof Error ? error.message : "Rollback apply failed.",
      },
    ]);

    throw error;
  }

  invalidateReferenceCache();
  invalidateRuleSnapshotCache();

  return {
    rollbackRunId,
    status: "applied",
    appliedRows,
    skippedRows,
  };
};
