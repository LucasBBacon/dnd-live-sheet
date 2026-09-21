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
      feats: [],
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
        choices: { classSelections: {}, traitSelections: {}, feats: [] },
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

  it("records the creation class as the first class taken (#74)", async () => {
    const { app, values } = await setupApp();

    const response = await request(app).post("/api/character").send(lyra);

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "class_bard",
        classLevel: 1,
        position: 0,
      }),
    );
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

  const setupLevelUp = async (
    ledgerSubclassId: string | null = null,
    characterRow: unknown = storedFighter,
  ) => {
    vi.resetModules();
    const selectResults: unknown[][] = [
      [characterRow],
      [
        {
          id: "ledger-1",
          characterId: "char-1",
          classId: "class_fighter",
          classLevel: 2,
          subclassId: ledgerSubclassId,
          position: 0,
        },
      ],
    ];
    const orderBy = vi.fn();
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Object.assign(Promise.resolve(rows), {
          orderBy: (...args: unknown[]) => {
            orderBy(...args);
            return Promise.resolve(rows);
          },
        });
      }),
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
    return { applyLevelUp, tx, orderBy };
  };

  /**
   * Same harness, but the real levelUpValidation module runs instead of the
   * mock: the resolver and CharacterBootstrapper.collectChoiceIssues both see
   * the real shipped pack, so a trait's own choice-block decision is resolved
   * (and validated) for real rather than by a canned mock return value.
   */
  const setupLevelUpWithRealValidation = async (
    existingClassRows: unknown[],
    characterRow: unknown = storedFighter,
  ) => {
    vi.resetModules();
    const selectResults: unknown[][] = [[characterRow], existingClassRows];
    const orderBy = vi.fn();
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        const rows = selectResults.shift() ?? [];
        return Object.assign(Promise.resolve(rows), {
          orderBy: (...args: unknown[]) => {
            orderBy(...args);
            return Promise.resolve(rows);
          },
        });
      }),
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
    vi.doMock("../../services/effectiveReferenceResolver.js", () => ({
      getEffectiveReferenceSnapshot: vi.fn().mockResolvedValue({ classes: [] }),
    }));
    mockRuleSnapshot();

    // levelUpValidation.js is NOT mocked here - prime its module-level
    // rulebook from the same real pack the route's own snapshot mock uses,
    // exactly as packFixture.usePackRulebook does for its unit tests
    const { setPackRulebookForTests } = await import(
      "../../services/packRulebook.js"
    );
    setPackRulebookForTests(snapshot);

    const { applyLevelUp } = await import(
      "../../controllers/characterController.js"
    );
    return { applyLevelUp, tx, orderBy };
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
          feats: [],
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

  it("answers a newly-granted trait's own question through traitSelections (real validation)", async () => {
    // rogue's multiclass prerequisite is DEX 13+; storedFighter's DEX 12
    // would fail that check before the fix under test is even reached
    const dexterousFighter = { ...storedFighter, dex: 14 };
    const { applyLevelUp, tx } = await setupLevelUpWithRealValidation(
      [
        {
          id: "ledger-1",
          characterId: "char-1",
          classId: "class_fighter",
          classLevel: 2,
          subclassId: null,
          position: 0,
        },
      ],
      dexterousFighter,
    );
    const { res, status } = response();

    await applyLevelUp(
      levelUp({
        targetClassId: "class_rogue",
        newTotalLevel: 3,
        subclassId: undefined,
        traitSelections: { rogue_multiclass_skill: ["stealth"] },
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.objectContaining({
          traitSelections: expect.objectContaining({
            rogue_multiclass_skill: ["stealth"],
          }),
        }),
      }),
    );
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ classId: "class_rogue", position: 1 }),
    );
  });

  it("dips into the next place after the highest position, not the class count (#74)", async () => {
    // stored fighter sits at position 2 (a gap below it, e.g. from a removed
    // class); the dip must land at 3, the next place after the highest
    // existing position, not at 1 (existingClasses.length)
    const dexterousFighter = { ...storedFighter, dex: 14 };
    const { applyLevelUp, tx } = await setupLevelUpWithRealValidation(
      [
        {
          id: "ledger-1",
          characterId: "char-1",
          classId: "class_fighter",
          classLevel: 2,
          subclassId: null,
          position: 2,
        },
      ],
      dexterousFighter,
    );
    const { res, status } = response();

    await applyLevelUp(
      levelUp({
        targetClassId: "class_rogue",
        newTotalLevel: 3,
        subclassId: undefined,
        traitSelections: { rogue_multiclass_skill: ["stealth"] },
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ classId: "class_rogue", position: 3 }),
    );
  });

  it("rejects a malformed traitSelections shape before writing", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res, status, json } = response();

    await applyLevelUp(
      levelUp({
        // a real choice block id, but a number instead of an array of
        // strings - engine validation would only catch a wrong-typed value
        // at a real block id by way of an uncaught "not iterable" TypeError,
        // which the route's catch turns into a 400 with the wrong message.
        // The shape check under test rejects it cleanly before that.
        traitSelections: { fighter_starting_skills: 42 },
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/^Invalid character choices: /),
      }),
    );
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("rejects a malformed selectedTraits shape before writing", async () => {
    const { applyLevelUp, tx } = await setupLevelUp();
    const { res, status, json } = response();

    await applyLevelUp(
      levelUp({
        // same story: a real progression node id, wrong-typed value
        selectedTraits: { fighter_level_1_fighting_style: 42 },
      }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/^Invalid character choices: /),
      }),
    );
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("stores no class_fighter entry when this level-up sends no picks and none were stored", async () => {
    const fighterWithNoClassPicks = {
      ...storedFighter,
      choices: {
        classSelections: {},
        traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
      },
    };
    const { applyLevelUp, tx } = await setupLevelUp(null, fighterWithNoClassPicks);
    const { res, status } = response();

    await applyLevelUp(levelUp({}), res);

    expect(status).toHaveBeenCalledWith(200);
    const setCall = tx.set.mock.calls.at(-1)?.[0];
    expect(setCall.choices.classSelections.class_fighter).toBeUndefined();
    expect(setCall.choices).toEqual({
      classSelections: {},
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
      feats: [],
    });
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

  it("reads the class ledger in the order the classes were taken (#74)", async () => {
    const { applyLevelUp, orderBy } = await setupLevelUp();
    const { res } = response();

    await applyLevelUp(levelUp({}), res);

    // Imported after setupLevelUp's vi.resetModules() so this is the same
    // module instance applyLevelUp itself resolved classLedgerOrder from -
    // importing it statically at file scope compares against a stale
    // pre-reset instance and fails equality despite being value-identical.
    const { classLedgerOrder } = await import("../../services/classLedger.js");
    expect(orderBy).toHaveBeenCalledWith(...classLedgerOrder);
  });
});
