import express, { type Request } from "express";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let snapshot: CoreRulePackSnapshot;

beforeAll(async () => {
  snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
});

const mockRuleSnapshot = () => {
  vi.doMock("../../services/ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({
      cacheVersion: 1,
      loadedAt: 0,
      snapshot,
    }),
    invalidateRuleSnapshotCache: () => undefined,
  }));
};

describe("POST /api/character choices", () => {
  const setupApp = async () => {
    vi.resetModules();
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values })) };
    const transaction = vi.fn(
      async (callback: (trx: unknown) => Promise<unknown>) => callback(tx),
    );

    vi.doMock("@project/database", () => ({ db: { transaction } }));
    vi.doMock("../../utils/inventory.js", () => ({
      processStartingEquipment: vi.fn(),
    }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(true),
    }));
    mockRuleSnapshot();

    const { default: characterRoutes } = await import("../character.js");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "user-1" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);
    return { app, transaction, values };
  };

  const lyra = {
    campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    name: "Lyra",
    raceId: "race_half_elf",
    subraceId: null,
    classId: "class_bard",
    subclassId: null,
    baseAbilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 15 },
    alignment: "Chaotic Good",
    background: {
      type: "PRESET",
      presetId: "background_noble",
      customData: null,
    },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
  };

  it("stores valid choices with the character", async () => {
    const { app, values } = await setupApp();
    const choices = {
      classSelections: {},
      traitSelections: {
        half_elf_asi_choice: ["DEX", "CON"],
        skill_versatility_choice: ["perception", "insight"],
      },
    };

    const response = await request(app)
      .post("/api/character")
      .send({ ...lyra, choices });

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ choices }));
  });

  it("stores no answers when the payload sends no choices", async () => {
    const { app, values } = await setupApp();

    const response = await request(app).post("/api/character").send(lyra);

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: { classSelections: {}, traitSelections: {} },
      }),
    );
  });

  it("rejects an option the question does not offer, before writing", async () => {
    const { app, transaction } = await setupApp();

    const response = await request(app)
      .post("/api/character")
      .send({
        ...lyra,
        choices: {
          classSelections: {},
          traitSelections: { skill_versatility_choice: ["not_a_skill", "insight"] },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid character choices.");
    expect(response.body.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("not_a_skill")]),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a choice block given the wrong number of picks", async () => {
    const { app, transaction } = await setupApp();

    const response = await request(app)
      .post("/api/character")
      .send({
        ...lyra,
        choices: {
          classSelections: {},
          traitSelections: { half_elf_asi_choice: ["DEX"] },
        },
      });

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
