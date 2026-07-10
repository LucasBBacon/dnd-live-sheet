import { db } from "@project/database";
import {
  rollbackIssues,
  rollbackRows,
  rollbackRuns,
} from "@project/database/src/schema/reference.js";
import { eq, desc } from "drizzle-orm";
import { RollbackPipelineError } from "./rollbackPipeline.js";

type RollbackRunRow = typeof rollbackRuns.$inferSelect;

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

export const assertRollbackRunBelongsToImportRun = async (
  rollbackRunId: string,
  sourceRunId: string,
): Promise<void> => {
  const run = await getRollbackRun(rollbackRunId);

  if (run.sourceRunId !== sourceRunId) {
    throw new RollbackPipelineError("Rollback run does not belong to source import run.", 400);
  }
};

export const listRollbackRunsForImportRun = async (sourceRunId: string): Promise<RollbackRunRow[]> =>
  db
    .select()
    .from(rollbackRuns)
    .where(eq(rollbackRuns.sourceRunId, sourceRunId))
    .orderBy(desc(rollbackRuns.plannedAt));

export const getRollbackRunSummary = async (rollbackRunId: string): Promise<{
  run: RollbackRunRow;
  rowCounts: Record<string, number>;
  issues: Array<typeof rollbackIssues.$inferSelect>;
}> => {
  const run = await getRollbackRun(rollbackRunId);
  const rows = await db
    .select()
    .from(rollbackRows)
    .where(eq(rollbackRows.runId, rollbackRunId));
  const issues = await db
    .select()
    .from(rollbackIssues)
    .where(eq(rollbackIssues.runId, rollbackRunId));

  const rowCounts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.rowType}:${row.status}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    run,
    rowCounts,
    issues,
  };
};
