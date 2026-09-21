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

describe("applyLevelUp choices", () => {
  const storedFighter = {
    id: "char-1",
    campaignId: "camp-1",
    raceId: "race_human",
    subraceId: null,
    backgroundId: null,
    str: 16,
    dex: 12,
    con: 14,
    int: 10,
    wis: 10,
    cha: 8,
    currentHp: 20,
    maxHp: 20,
    choices: {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    },
  };

  const setupLevelUp = async (ledgerSubclassId: string | null = null) => {
    vi.resetModules();
    const selectResults: unknown[][] = [
      [storedFighter],
      [
        {
          id: "ledger-1",
          characterId: "char-1",
          classId: "class_fighter",
          classLevel: 2,
          subclassId: ledgerSubclassId,
        },
      ],
    ];
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock("@project/database", () => ({
      db: {
        transaction: vi.fn(
          async (callback: (trx: unknown) => Promise<unknown>) => callback(tx),
        ),
      },
    }));
    vi.doMock("../../services/levelUpValidation.js", () => ({
      resolveNextLevelValidationContext: vi.fn().mockReturnValue({
        targetLevel: 3,
        isConfigured: true,
        reason: null,
        grantedTraitIds: [],
        decisionTypes: [],
        decisions: [],
      }),
      validateMulticlassPrerequisites: vi.fn(),
      validateLevelUpPayloadFromResolver: vi.fn(),
    }));
    vi.doMock("../../services/effectiveReferenceResolver.js", () => ({
      getEffectiveReferenceSnapshot: vi.fn().mockResolvedValue({ classes: [] }),
    }));
    mockRuleSnapshot();

    const { applyLevelUp } = await import(
      "../../controllers/characterController.js"
    );
    return { applyLevelUp, tx };
  };

  const levelUp = (body: Record<string, unknown>) =>
    ({
      body: {
        characterId: "char-1",
        targetClassId: "class_fighter",
        newTotalLevel: 3,
        hpRoll: 7,
        subclassId: "subclass_fighter_battle_master",
        ...body,
      },
    }) as Request;

  const response = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    return { res: { status, json } as unknown as express.Response, status, json };
  };

  const maneuvers = [
    "trait_maneuver_precision_attack",
    "trait_maneuver_riposte",
    "trait_maneuver_trip_attack",
  ];

  it("merges this level's picks into the stored choices, keyed by node", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res, status } = response();

    await applyLevelUp(
      levelUp({ selectedTraits: { fighter_bm_level_3_maneuvers: maneuvers } }),
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: {
          classSelections: {
            class_fighter: {
              fighter_level_1_fighting_style: ["trait_fs_defense"],
              fighter_bm_level_3_maneuvers: maneuvers,
            },
          },
          traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
        },
      }),
    );
  });

  it("no longer writes the picks as player_choice trait rows", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res } = response();

    await applyLevelUp(
      levelUp({ selectedTraits: { fighter_bm_level_3_maneuvers: maneuvers } }),
      res,
    );

    const rows = tx.values.mock.calls.flatMap(([arg]) =>
      Array.isArray(arg) ? arg : [arg],
    );
    expect(rows).not.toContainEqual(
      expect.objectContaining({ source: "player_choice" }),
    );
  });

  it("rejects a trait selection the character is not offered", async () => {
    const { applyLevelUp } = await setupLevelUp();
    const { res, status, json } = response();

    await applyLevelUp(
      levelUp({ traitSelections: { fighter_starting_skills: ["arcana", "history"] } }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/^Invalid character choices: .*arcana/),
      }),
    );
  });

  it("validates against the persisted subclass when the payload's subclassId is blank", async () => {
    const { applyLevelUp, tx } = await setupLevelUp("subclass_fighter_battle_master");
    const { res, status } = response();

    await applyLevelUp(
      levelUp({
        subclassId: "",
        selectedTraits: { fighter_bm_level_3_maneuvers: maneuvers },
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ subclassId: "subclass_fighter_battle_master" }),
    );
  });
});
