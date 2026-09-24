import path from "node:path";
import express, { type Request } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { FakeDb } from "../../gateway/__tests__/fakeDb.js";
import { globalErrorHandler } from "../../middleware/errorHandler.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * A hill dwarf fighter 3 (Champion): CON 13 stored, 15 with the dwarf's +2,
 * 22 rolled - the sample Brannoc Hale, whose level 4 the review step used to
 * preview wrongly (#88).
 */
const brannoc = {
  id: "char-1",
  campaignId: "camp-1",
  name: "Brannoc Hale",
  level: 3,
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  backgroundId: "background_soldier",
  str: 16,
  dex: 12,
  con: 13,
  int: 10,
  wis: 12,
  cha: 8,
  maxHp: 22,
  currentHp: 31,
  choices: {
    feats: [],
    classSelections: {
      class_fighter: { fighter_level_1_fighting_style: ["trait_fs_dueling"] },
    },
    traitSelections: {
      dwarf_artisan_tools: ["masons_tools"],
      soldier_gaming_set: ["playing_card_set"],
      fighter_starting_skills: ["perception", "survival"],
    },
  },
};

const ledger = [
  {
    id: "ledger-1",
    characterId: "char-1",
    classId: "class_fighter",
    classLevel: 3,
    subclassId: "subclass_fighter_champion",
    position: 0,
  },
];

describe("POST /api/character/:characterId/level-up/preview (#88)", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  const setupApp = async ({
    rows = [brannoc],
    member = true,
  }: { rows?: Array<Record<string, unknown>>; member?: boolean } = {}) => {
    vi.resetModules();

    const fakeDb = new FakeDb()
      .seed("characters", rows)
      .seed("character_classes", ledger);

    vi.doMock("@project/database", () => ({ db: fakeDb }));
    vi.doMock("../../services/campaignAccess.js", () => ({
      isUserCampaignMember: vi.fn().mockResolvedValue(member),
    }));
    vi.doMock("../../services/ruleSnapshotCache.js", () => ({
      getCachedRuleSnapshot: async () => ({
        cacheVersion: 1,
        loadedAt: 0,
        snapshot,
      }),
      invalidateRuleSnapshotCache: () => undefined,
    }));

    const { default: characterRoutes } = await import("../character.js");

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as Request & { user?: { id: string } }).user = { id: "test-user" };
      next();
    });
    app.use("/api/character", characterRoutes);
    app.use(globalErrorHandler);

    return { app, fakeDb };
  };

  it("previews the gain the level-up stores, counting a Constitution increase's earlier levels", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({
        targetClassId: "class_fighter",
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      });

    // before: 22 + 2 x 3 + Dwarven Toughness 3 = 31. After: 28 rolled +
    // 3 x 4 (CON 16) + 4 = 44. The old preview said 6 + 3 = 9
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });
  });

  it("reads without opening a transaction", async () => {
    const { app, fakeDb } = await setupApp();

    await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it("refuses a draft with no class", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ hpRoll: 6 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("targetClassId");
  });

  it("refuses a roll that is not a number", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: "6" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("hpRoll");
  });

  it("refuses an increase the level-up would refuse, rather than answering NaN (#106)", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({
        targetClassId: "class_fighter",
        hpRoll: 6,
        asiChoices: [{ stat: "CON", value: 3 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Invalid character choices: ability score increases must total 2, not 3.",
    );
  });

  it("refuses a preview naming a class the pack does not define", async () => {
    const { app } = await setupApp();

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_unknown", hpRoll: 6 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Invalid character choices: unknown class class_unknown",
    );
  });

  it("returns 404 for a character that does not exist", async () => {
    const { app } = await setupApp({ rows: [] });

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Character not found." });
  });

  it("returns 403 to a user outside the character's campaign", async () => {
    const { app } = await setupApp({ member: false });

    const response = await request(app)
      .post("/api/character/char-1/level-up/preview")
      .send({ targetClassId: "class_fighter", hpRoll: 6 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden campaign access." });
  });
});
