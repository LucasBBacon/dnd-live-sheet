import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import importRoutes from "../import.js";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

const importMocks = vi.hoisted(() => ({
  stageImportRun: vi.fn(),
  validateImportRun: vi.fn(),
  planImportRun: vi.fn(),
  applyImportRun: vi.fn(),
  publishImportRun: vi.fn(),
  getImportRunSummary: vi.fn(),
}));

const rollbackPipelineMocks = vi.hoisted(() => ({
  planRollbackRun: vi.fn(),
  applyRollbackRun: vi.fn(),
}));

const rollbackReadModelMocks = vi.hoisted(() => ({
  assertRollbackRunBelongsToImportRun: vi.fn(),
  listRollbackRunsForImportRun: vi.fn(),
  getRollbackRunSummary: vi.fn(),
}));

vi.mock("../../services/importPipeline.js", () => ({
  ImportPipelineError: class ImportPipelineError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
      super(message);
      this.name = "ImportPipelineError";
      this.statusCode = statusCode;
    }
  },
  stageImportRun: importMocks.stageImportRun,
  validateImportRun: importMocks.validateImportRun,
  planImportRun: importMocks.planImportRun,
  applyImportRun: importMocks.applyImportRun,
  publishImportRun: importMocks.publishImportRun,
  getImportRunSummary: importMocks.getImportRunSummary,
}));

vi.mock("../../services/rollbackPipeline.js", () => ({
  RollbackPipelineError: class RollbackPipelineError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
      super(message);
      this.name = "RollbackPipelineError";
      this.statusCode = statusCode;
    }
  },
  planRollbackRun: rollbackPipelineMocks.planRollbackRun,
  applyRollbackRun: rollbackPipelineMocks.applyRollbackRun,
}));

vi.mock("../../services/rollbackReadModel.js", () => ({
  assertRollbackRunBelongsToImportRun: rollbackReadModelMocks.assertRollbackRunBelongsToImportRun,
  listRollbackRunsForImportRun: rollbackReadModelMocks.listRollbackRunsForImportRun,
  getRollbackRunSummary: rollbackReadModelMocks.getRollbackRunSummary,
}));

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { user?: { id: string } }).user = { id: "test-user" };
    next();
  });
  app.use("/api/import", importRoutes);
  app.use(globalErrorHandler);
  return app;
};

describe("Import Routes Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes stage -> validate -> plan -> apply -> publish happy path", async () => {
    importMocks.stageImportRun.mockResolvedValueOnce({
      runId: "run-1",
      status: "staged",
      totals: { entities: 1, relations: 0 },
    });
    importMocks.validateImportRun.mockResolvedValueOnce({
      runId: "run-1",
      status: "validated",
      totalIssues: 0,
    });
    importMocks.planImportRun.mockResolvedValueOnce({
      runId: "run-1",
      status: "planned",
      insertCount: 1,
      updateCount: 0,
      archiveCount: 0,
      relationAddCount: 0,
      relationRemoveCount: 0,
      skipCount: 0,
    });
    importMocks.applyImportRun.mockResolvedValueOnce({ runId: "run-1", status: "applied" });
    importMocks.publishImportRun.mockResolvedValueOnce({ runId: "run-1", publishedRows: 1 });
    importMocks.getImportRunSummary.mockResolvedValueOnce({
      run: {
        id: "run-1",
        status: "applied",
        validateDurationMs: 12,
        planDurationMs: 7,
        applyDurationMs: 24,
        publishDurationMs: 6,
        totalDurationMs: 58,
        appliedRowCountsByKind: {
          trait: 1,
          feat_trait: 1,
        },
      },
      rowCounts: { "entity:applied": 1 },
      issues: [],
    });

    const app = createApp();

    const stageResponse = await request(app)
      .post("/api/import/stage")
      .send({
        pack: {
          packId: "homebrew_pack_1",
          name: "Homebrew Pack",
          schemaVersion: "1.0.0",
          sourceType: "homebrew",
          ownerCampaignId: "00000000-0000-0000-0000-000000000001",
          createdByUserId: "test-user",
          publishMode: "draft",
          conflictPolicy: "upsert",
          idPolicy: "stable",
        },
        entries: [],
        relations: [],
      });

    expect(stageResponse.status).toBe(201);
    expect(stageResponse.body.runId).toBe("run-1");
    expect(importMocks.stageImportRun).toHaveBeenCalledWith({
      payload: expect.any(Object),
      actorUserId: "test-user",
    });

    const validateResponse = await request(app).post("/api/import/run-1/validate");
    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.status).toBe("validated");
    expect(importMocks.validateImportRun).toHaveBeenCalledWith("run-1");

    const planResponse = await request(app).post("/api/import/run-1/plan");
    expect(planResponse.status).toBe(200);
    expect(planResponse.body.status).toBe("planned");
    expect(importMocks.planImportRun).toHaveBeenCalledWith("run-1");

    const applyResponse = await request(app).post("/api/import/run-1/apply");
    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body.status).toBe("applied");
    expect(importMocks.applyImportRun).toHaveBeenCalledWith("run-1");

    const publishResponse = await request(app).post("/api/import/run-1/publish");
    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.publishedRows).toBe(1);
    expect(importMocks.publishImportRun).toHaveBeenCalledWith("run-1");

    const summaryResponse = await request(app).get("/api/import/run-1");
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.run.id).toBe("run-1");
    expect(summaryResponse.body.run.validateDurationMs).toBe(12);
    expect(summaryResponse.body.run.planDurationMs).toBe(7);
    expect(summaryResponse.body.run.applyDurationMs).toBe(24);
    expect(summaryResponse.body.run.publishDurationMs).toBe(6);
    expect(summaryResponse.body.run.totalDurationMs).toBe(58);
    expect(summaryResponse.body.run.appliedRowCountsByKind).toEqual({
      trait: 1,
      feat_trait: 1,
    });
    expect(importMocks.getImportRunSummary).toHaveBeenCalledWith("run-1");
  });

  it("returns failure response when planning detects blocking conflicts", async () => {
    importMocks.stageImportRun.mockResolvedValueOnce({
      runId: "run-fail",
      status: "staged",
      totals: { entities: 1, relations: 0 },
    });
    importMocks.validateImportRun.mockResolvedValueOnce({
      runId: "run-fail",
      status: "validated",
      totalIssues: 0,
    });
    importMocks.planImportRun.mockRejectedValueOnce(
      Object.assign(new Error("Planning detected blocking conflicts."), {
        name: "ImportPipelineError",
        statusCode: 400,
      }),
    );

    const app = createApp();

    const stageResponse = await request(app)
      .post("/api/import/stage")
      .send({
        pack: {
          packId: "homebrew_pack_fail",
          name: "Homebrew Pack Fail",
          schemaVersion: "1.0.0",
          sourceType: "homebrew",
          ownerCampaignId: "00000000-0000-0000-0000-000000000001",
          createdByUserId: "test-user",
          publishMode: "draft",
          conflictPolicy: "fail",
          idPolicy: "stable",
        },
        entries: [],
        relations: [],
      });

    expect(stageResponse.status).toBe(201);

    const validateResponse = await request(app).post("/api/import/run-fail/validate");
    expect(validateResponse.status).toBe(200);

    const planResponse = await request(app).post("/api/import/run-fail/plan");
    expect(planResponse.status).toBe(400);
    expect(planResponse.body.error).toBe("ImportPipelineError");
    expect(planResponse.body.message).toContain("blocking conflicts");

    expect(importMocks.planImportRun).toHaveBeenCalledWith("run-fail");
    expect(importMocks.applyImportRun).not.toHaveBeenCalled();
    expect(importMocks.publishImportRun).not.toHaveBeenCalled();
  });

  it("executes rollback plan -> apply and fetches rollback summaries", async () => {
    rollbackReadModelMocks.assertRollbackRunBelongsToImportRun.mockResolvedValue(undefined);
    rollbackPipelineMocks.planRollbackRun.mockResolvedValueOnce({
      rollbackRunId: "rollback-1",
      status: "planned",
      totalRows: 2,
      totalIssues: 0,
    });
    rollbackPipelineMocks.applyRollbackRun.mockResolvedValueOnce({
      rollbackRunId: "rollback-1",
      status: "applied",
      appliedRows: 2,
      skippedRows: 0,
    });
    rollbackReadModelMocks.listRollbackRunsForImportRun.mockResolvedValueOnce([
      {
        id: "rollback-1",
        sourceRunId: "run-1",
        status: "applied",
      },
    ]);
    rollbackReadModelMocks.getRollbackRunSummary.mockResolvedValueOnce({
      run: {
        id: "rollback-1",
        sourceRunId: "run-1",
        status: "applied",
        appliedRowCountsByKind: { trait: 1, feat_trait: 1 },
      },
      rowCounts: { "entity:applied": 1, "relation:applied": 1 },
      issues: [],
    });

    const app = createApp();

    const planResponse = await request(app).post("/api/import/run-1/rollback/plan");
    expect(planResponse.status).toBe(200);
    expect(planResponse.body.rollbackRunId).toBe("rollback-1");
    expect(rollbackPipelineMocks.planRollbackRun).toHaveBeenCalledWith({
      sourceRunId: "run-1",
      initiatedByUserId: "test-user",
    });

    const applyResponse = await request(app).post("/api/import/run-1/rollback/rollback-1/apply");
    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body.status).toBe("applied");
    expect(rollbackReadModelMocks.assertRollbackRunBelongsToImportRun).toHaveBeenCalledWith(
      "rollback-1",
      "run-1",
    );
    expect(rollbackPipelineMocks.applyRollbackRun).toHaveBeenCalledWith("rollback-1");

    const listResponse = await request(app).get("/api/import/run-1/rollback");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.rollbacks).toHaveLength(1);
    expect(rollbackReadModelMocks.listRollbackRunsForImportRun).toHaveBeenCalledWith("run-1");

    const summaryResponse = await request(app).get("/api/import/run-1/rollback/rollback-1");
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.run.id).toBe("rollback-1");
    expect(summaryResponse.body.run.appliedRowCountsByKind).toEqual({ trait: 1, feat_trait: 1 });
    expect(rollbackReadModelMocks.assertRollbackRunBelongsToImportRun).toHaveBeenLastCalledWith(
      "rollback-1",
      "run-1",
    );
    expect(rollbackReadModelMocks.getRollbackRunSummary).toHaveBeenCalledWith("rollback-1");
  });

  it("returns failure response when rollback apply fails", async () => {
    rollbackReadModelMocks.assertRollbackRunBelongsToImportRun.mockResolvedValue(undefined);
    rollbackPipelineMocks.applyRollbackRun.mockRejectedValueOnce(
      Object.assign(new Error("Rollback apply failed."), {
        name: "RollbackPipelineError",
        statusCode: 400,
      }),
    );

    const app = createApp();

    const response = await request(app).post("/api/import/run-1/rollback/rollback-fail/apply");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("RollbackPipelineError");
    expect(response.body.message).toContain("Rollback apply failed");
    expect(rollbackPipelineMocks.applyRollbackRun).toHaveBeenCalledWith("rollback-fail");
  });

  it("returns failure response when rollback run does not belong to import run", async () => {
    rollbackReadModelMocks.assertRollbackRunBelongsToImportRun.mockRejectedValueOnce(
      Object.assign(new Error("Rollback run does not belong to source import run."), {
        name: "RollbackPipelineError",
        statusCode: 400,
      }),
    );

    const app = createApp();

    const response = await request(app).post("/api/import/run-1/rollback/rollback-2/apply");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("RollbackPipelineError");
    expect(response.body.message).toContain("does not belong");
    expect(rollbackPipelineMocks.applyRollbackRun).not.toHaveBeenCalled();
  });
});
