import { Router, type Router as ExpressRouter } from "express";
import {
  ImportPipelineError,
  applyImportRun,
  getImportRunSummary,
  planImportRun,
  publishImportRun,
  stageImportRun,
  validateImportRun,
} from "../services/importPipeline.js";
import {
  applyRollbackRun,
  planRollbackRun,
} from "../services/rollbackPipeline.js";
import {
  assertRollbackRunBelongsToImportRun,
  getRollbackRunSummary,
  listRollbackRunsForImportRun,
} from "../services/rollbackReadModel.js";

const router: ExpressRouter = Router();

const getRequiredParam = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ImportPipelineError(`${name} route param is required.`);
  }
  return value;
};

const getRequiredUserId = (req: { user?: { id?: string } }): string => {
  const userId = req.user?.id;
  if (!userId) {
    throw new ImportPipelineError("Unauthorized request", 401);
  }
  return userId;
};

// #region POST /import/stage

router.post("/stage", async (req, res, next) => {
  try {
    const actorUserId = getRequiredUserId(req);
    const staged = await stageImportRun({ payload: req.body, actorUserId });
    return res.status(201).json(staged);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/validate

router.post("/:runId/validate", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const result = await validateImportRun(runId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/plan

router.post("/:runId/plan", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const plan = await planImportRun(runId);
    return res.status(200).json(plan);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/apply

router.post("/:runId/apply", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const applied = await applyImportRun(runId);
    return res.status(200).json(applied);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/publish

router.post("/:runId/publish", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const published = await publishImportRun(runId);
    return res.status(200).json(published);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region GET /import/:runId

router.get("/:runId", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const summary = await getImportRunSummary(runId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/rollback/plan

router.post("/:runId/rollback/plan", async (req, res, next) => {
  try {
    const userId = getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const planned = await planRollbackRun({
      sourceRunId: runId,
      initiatedByUserId: userId,
    });
    return res.status(200).json(planned);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region POST /import/:runId/rollback/:rollbackRunId/apply

router.post("/:runId/rollback/:rollbackRunId/apply", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const rollbackRunId = getRequiredParam(
      req.params.rollbackRunId,
      "rollbackRunId",
    );
    await assertRollbackRunBelongsToImportRun(rollbackRunId, runId);
    const applied = await applyRollbackRun(rollbackRunId);
    return res.status(200).json(applied);
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region GET /import/:runId/rollback

router.get("/:runId/rollback", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const rollbacks = await listRollbackRunsForImportRun(runId);
    return res.status(200).json({ rollbacks });
  } catch (error) {
    return next(error);
  }
});

// #endregion

// #region GET /import/:runId/rollback/:rollbackRunId

router.get("/:runId/rollback/:rollbackRunId", async (req, res, next) => {
  try {
    getRequiredUserId(req);
    const runId = getRequiredParam(req.params.runId, "runId");
    const rollbackRunId = getRequiredParam(
      req.params.rollbackRunId,
      "rollbackRunId",
    );
    await assertRollbackRunBelongsToImportRun(rollbackRunId, runId);
    const summary = await getRollbackRunSummary(rollbackRunId);
    return res.status(200).json(summary);
  } catch (error) {
    return next(error);
  }
});

// #endregion

export default router;
