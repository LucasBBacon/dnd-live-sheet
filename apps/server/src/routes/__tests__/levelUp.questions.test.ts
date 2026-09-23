import express, { type Request } from "express";
import path from "node:path";
import request from "supertest";
import { getTableName, type Table } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { blockedOptionIds, type ChoiceQuestion } from "@project/engine";
import { globalErrorHandler } from "../../middleware/errorHandler.js";
import { renderSql } from "../../gateway/__tests__/fakeDb.js";

/**
 * The level-up questions the wizard is sent (GET /reference/level-up/options)
 * and the answers applyLevelUp requires come from one server helper, against
 * the real shipped pack. Each scenario asks the options endpoint for the
 * questions, answers exactly those, and levels up - so a level the wizard
 * cannot finish fails here, not at the table.
 */

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let snapshot: CoreRulePackSnapshot;

beforeAll(async () => {
  snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
});

type LedgerRow = {
  id: string;
  characterId: string;
  classId: string;
  classLevel: number;
  subclassId: string | null;
  position: number;
};

type CharacterRow = {
  id: string;
  campaignId: string;
  raceId: string;
  subraceId: string | null;
  backgroundId: string | null;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  currentHp: number;
  maxHp: number;
  choices: {
    classSelections: Record<string, Record<string, string[]>>;
    traitSelections: Record<string, string[]>;
    feats: string[];
  };
};

const character = (overrides: Partial<CharacterRow> = {}): CharacterRow => ({
  id: "char-1",
  campaignId: "camp-1",
  raceId: "race_human",
  subraceId: null,
  backgroundId: null,
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 13,
  cha: 13,
  currentHp: 30,
  maxHp: 30,
  choices: {
    classSelections: {
      class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
    },
    traitSelections: {
      human_language_choice: ["elvish"],
      fighter_starting_skills: ["athletics", "perception"],
    },
    feats: [],
  },
  ...overrides,
});

const fighter = (classLevel: number, subclassId: string | null = null): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_fighter",
  classLevel,
  subclassId,
  position: 0,
});

/** a human Life cleric with the level-1 questions other than cantrips answered */
const humanCleric = (clericPicks: Record<string, string[]> = {}): CharacterRow =>
  character({
    wis: 16,
    choices: {
      classSelections: { class_cleric: clericPicks },
      traitSelections: {
        human_language_choice: ["elvish"],
        cleric_starting_skills: ["history", "medicine"],
      },
      feats: [],
    },
  });

const cleric = (classLevel: number): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_cleric",
  classLevel,
  subclassId: "subclass_cleric_life",
  position: 0,
});

const druid = (classLevel: number, subclassId: string | null = null): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_druid",
  classLevel,
  subclassId,
  position: 0,
});

/** a human Fiend warlock with the level-1 questions other than cantrips answered */
const humanWarlock = (warlockPicks: Record<string, string[]>): CharacterRow =>
  character({
    cha: 16,
    choices: {
      classSelections: { class_warlock: warlockPicks },
      traitSelections: {
        human_language_choice: ["elvish"],
        warlock_starting_skills: ["arcana", "deception"],
      },
      feats: [],
    },
  });

const warlock = (classLevel: number): LedgerRow => ({
  id: "ledger-1",
  characterId: "char-1",
  classId: "class_warlock",
  classLevel,
  subclassId: "subclass_warlock_fiend",
  position: 0,
});

/**
 * A stand-in for drizzle that answers every select by the table it reads:
 * the character row for `characters`, the ledger for `character_classes`.
 * Writes are recorded, never applied.
 */
const fakeDatabase = (characterRow: CharacterRow, ledger: LedgerRow[]) => {
  const rowsFor = (table: Table): unknown[] => {
    const name = getTableName(table);
    if (name === "characters") return [characterRow];
    if (name === "character_classes") return ledger;
    return [];
  };
  const rows = (result: unknown[]) =>
    Object.assign(Promise.resolve(result), {
      limit: () => Promise.resolve(result),
      orderBy: () => Promise.resolve(result),
    });
  const sets: unknown[] = [];
  const inserted: unknown[] = [];

  const db = {
    select: () => ({
      from: (table: Table) => ({ where: () => rows(rowsFor(table)) }),
    }),
    update: () => ({
      set: (value: unknown) => {
        sets.push(value);
        return { where: () => Promise.resolve([]) };
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        inserted.push(value);
        return Promise.resolve(undefined);
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(db),
  };

  return { db, sets, inserted };
};

const setup = async (characterRow: CharacterRow, ledger: LedgerRow[]) => {
  vi.resetModules();
  const fake = fakeDatabase(characterRow, ledger);

  vi.doMock("@project/database", () => ({ db: fake.db }));
  vi.doMock("../../services/ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({ cacheVersion: 1, loadedAt: 0, snapshot }),
    invalidateRuleSnapshotCache: () => undefined,
  }));
  vi.doMock("../../services/effectiveReferenceResolver.js", () => ({
    getEffectiveReferenceSnapshot: vi.fn().mockResolvedValue({
      classes: [],
      subclassesByClassId: new Map(),
      classLevelsByClassId: new Map(),
      subclassById: new Map(),
      subclassTraitsBySubclassLevel: new Map(),
      classTraitsByClassLevel: new Map(),
    }),
    listEffectiveFeats: vi.fn().mockResolvedValue([]),
    searchEffectiveItems: vi.fn(),
  }));
  vi.doMock("../../services/campaignAccess.js", () => ({
    getHeaderOrAuthUserId: vi.fn().mockReturnValue("user-1"),
    isUserCampaignMember: vi.fn().mockResolvedValue(true),
  }));
  vi.doUnmock("../../services/levelUpValidation.js");

  const { setPackRulebookForTests } = await import("../../services/packRulebook.js");
  setPackRulebookForTests(snapshot);

  const { DatabaseReferenceProvider } = await import(
    "../../services/referenceProvider/databaseReferenceProvider.js"
  );
  const provider = new DatabaseReferenceProvider();
  vi.doMock("../../services/referenceProvider/index.js", () => ({
    getReferenceProvider: () => provider,
  }));

  const { default: referenceRoutes } = await import("../reference.js");
  const { applyLevelUp } = await import("../../controllers/characterController.js");

  const app = express();
  app.use(express.json());
  app.use("/api/reference", referenceRoutes);
  app.use(globalErrorHandler);

  const options = async (query: Record<string, string>) => {
    const response = await request(app)
      .get("/api/reference/level-up/options")
      .query({ campaignId: "camp-1", characterId: "char-1", ...query });
    expect(response.status).toBe(200);
    return response.body as {
      choiceQuestions: ChoiceQuestion[];
      nextLevel: { decisions: Array<{ id: string; type: string; options?: string[] }> };
    };
  };

  const levelUp = async (body: Record<string, unknown>) => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    await applyLevelUp(
      { body: { characterId: "char-1", hpRoll: 6, ...body } } as Request,
      { status, json } as unknown as express.Response,
    );
    return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] };
  };

  return { app, options, levelUp, ...fake };
};

/**
 * Answers every question the way the wizard's picker would let a player: the
 * first options that are not blocked (held, or with unmet prerequisites) and
 * not already chosen for another question.
 */
const answerAll = (questions: ChoiceQuestion[], taken: string[] = []) => {
  const selectedTraits: Record<string, string[]> = {};
  const traitSelections: Record<string, string[]> = {};
  const used = new Set(taken);

  for (const question of questions) {
    const picks = question.options
      .map((option) => option.id)
      .filter((id) => !blockedOptionIds(question).includes(id) && !used.has(id))
      .slice(0, question.pickCount);
    picks.forEach((id) => used.add(id));
    if (question.target === "class") selectedTraits[question.id] = picks;
    else traitSelections[question.id] = picks;
  }

  return { selectedTraits, traitSelections };
};

const ids = (questions: ChoiceQuestion[]) => questions.map((question) => question.id);

describe("level-up questions: offered by the options endpoint, required by applyLevelUp", () => {
  it("asks a Champion's level-10 fighting style from the stored subclass, and accepts the answer", async () => {
    const { options, levelUp } = await setup(character(), [
      fighter(9, "subclass_fighter_champion"),
    ]);

    const { choiceQuestions } = await options({ classId: "class_fighter" });
    expect(ids(choiceQuestions)).toEqual(["fighter_champion_level_10_fighting_style"]);

    const answers = answerAll(choiceQuestions, ["trait_fs_defense"]);
    const result = await levelUp({
      targetClassId: "class_fighter",
      newTotalLevel: 10,
      ...answers,
    });
    expect(result).toEqual(expect.objectContaining({ status: 200 }));
  });

  it("resolves a level-up with no subclassId against the stored subclass (Battle Master 6 -> 7)", async () => {
    const { options, levelUp, inserted } = await setup(character(), [
      fighter(6, "subclass_fighter_battle_master"),
    ]);

    const { choiceQuestions, nextLevel } = await options({ classId: "class_fighter" });
    expect(ids(choiceQuestions)).toEqual(["fighter_bm_level_7_maneuvers"]);
    expect(nextLevel.decisions.map((decision) => decision.id)).toContain(
      "fighter_bm_level_7_maneuvers",
    );

    const result = await levelUp({
      targetClassId: "class_fighter",
      newTotalLevel: 7,
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
    // the stored subclass's own level-7 feature is materialised like any
    // other granted trait
    expect(inserted).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({ traitId: "trait_know_your_enemy" }),
      ]),
    );
  });

  it("offers Battle Master's maneuvers once the subclass is picked at its unlock level", async () => {
    const { options, levelUp } = await setup(character(), [fighter(2)]);

    const unpicked = await options({ classId: "class_fighter" });
    expect(ids(unpicked.choiceQuestions)).not.toContain("fighter_bm_level_3_maneuvers");

    const { choiceQuestions } = await options({
      classId: "class_fighter",
      subclassId: "subclass_fighter_battle_master",
    });
    expect(ids(choiceQuestions)).toContain("fighter_bm_level_3_maneuvers");

    const result = await levelUp({
      targetClassId: "class_fighter",
      newTotalLevel: 3,
      subclassId: "subclass_fighter_battle_master",
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });

  it("asks a Draconic sorcerer dip for its dragon ancestor, and accepts the answer", async () => {
    const { options, levelUp } = await setup(character(), [fighter(3, "subclass_fighter_champion")]);

    const { choiceQuestions } = await options({
      classId: "class_sorcerer",
      subclassId: "subclass_sorcerer_draconic",
    });
    expect(ids(choiceQuestions)).toContain("sorcerer_draconic_level_1_ancestor");

    const result = await levelUp({
      targetClassId: "class_sorcerer",
      newTotalLevel: 4,
      subclassId: "subclass_sorcerer_draconic",
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });

  it("asks a Knowledge cleric dip for its domain's languages and skills, and accepts the answers", async () => {
    const { options, levelUp } = await setup(character(), [fighter(3, "subclass_fighter_champion")]);

    const { choiceQuestions } = await options({
      classId: "class_cleric",
      subclassId: "subclass_cleric_knowledge",
    });
    expect(ids(choiceQuestions)).toEqual(
      expect.arrayContaining([
        "knowledge_domain_languages",
        "knowledge_domain_skills",
        // a dip into a caster asks its level-1 cantrips like any other
        // level-1 question (#79)
        "cleric_level_1_cantrips",
      ]),
    );

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      subclassId: "subclass_cleric_knowledge",
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });

  it("asks a cleric 3 -> 4 for its level-4 cantrip, requires it, and stores the answer (#79)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);

    const { choiceQuestions, nextLevel } = await options({ classId: "class_cleric" });
    expect(ids(choiceQuestions)).toEqual(["cleric_level_4_cantrips"]);
    expect(choiceQuestions[0]!.options).toContainEqual({
      id: "spell_thaumaturgy",
      label: "Thaumaturgy",
    });
    // no spell decision left to give the wizard a step that blocks it
    expect(nextLevel.decisions.map((decision) => decision.type)).not.toContain(
      "spell_selection",
    );

    const unanswered = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
    });
    expect(unanswered.status).toBe(400);
    expect(unanswered.body.error).toBe(
      "Invalid character choices: Cleric: nothing selected for cleric_level_4_cantrips",
    );

    const answered = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      selectedTraits: { cleric_level_4_cantrips: ["spell_thaumaturgy"] },
    });
    expect(answered.status).toBe(200);
    expect(sets).toContainEqual(
      expect.objectContaining({
        choices: expect.objectContaining({
          classSelections: {
            class_cleric: { cleric_level_4_cantrips: ["spell_thaumaturgy"] },
          },
        }),
      }),
    );
  });

  it("raises hit points by the roll plus the Constitution modifier (#78)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      hpRoll: 5,
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(200);
    // the character row starts at maxHp 30 (the shared fixture), CON 14 -> 15
    // (+2) as a human: the base grows by the roll alone, and current hit
    // points by the roll plus one level's Constitution
    const written = sets.find(
      (value): value is { maxHp: unknown; currentHp: unknown } =>
        typeof value === "object" && value !== null && "maxHp" in value,
    );
    expect(written).toBeDefined();
    // maxHp: COALESCE(max_hp, 0) + the roll alone
    expect(renderSql(written!.maxHp).params).toEqual([5]);
    // currentHp: COALESCE(current_hp, 0) + the roll (5) plus one level's
    // Constitution (max(1, 2) x 1 = 2) = 7
    expect(renderSql(written!.currentHp).params).toEqual([7]);
  });

  it("marks Agonizing Blast for a warlock 1 -> 2 who never learned Eldritch Blast, and accepts what the picker allows (#81)", async () => {
    const { options, levelUp } = await setup(
      humanWarlock({
        warlock_level_1_cantrips: ["spell_minor_illusion", "spell_dancing_lights"],
      }),
      [warlock(1)],
    );

    const { choiceQuestions } = await options({ classId: "class_warlock" });
    const invocations = choiceQuestions.find(
      (question) => question.id === "warlock_level_2_invocations",
    );
    expect(
      invocations?.options.find(
        (option) => option.id === "trait_invocation_agonizing_blast",
      )?.unmet,
    ).toEqual(["needs Eldritch Blast"]);

    const result = await levelUp({
      targetClassId: "class_warlock",
      newTotalLevel: 2,
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });

  // the lock is generic; this pins that a stored spell answer is covered too
  it("refuses to re-answer a cantrip the character already stored", async () => {
    const { levelUp } = await setup(
      humanCleric({
        cleric_level_1_cantrips: [
          "spell_thaumaturgy",
          "spell_minor_illusion",
          "spell_dancing_lights",
        ],
      }),
      [cleric(1)],
    );

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 2,
      selectedTraits: {
        cleric_level_1_cantrips: [
          "spell_faerie_fire",
          "spell_minor_illusion",
          "spell_dancing_lights",
        ],
      },
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      "Invalid character choices: cleric_level_1_cantrips already answered",
    );
  });

  // a stored pick a later grant makes redundant must not block every future
  // level-up: level-up only checks answers it is sent and questions new at
  // this level, not the whole save (#84)
  it("lets a Land druid level up past a stored cantrip a new circle trait makes redundant", async () => {
    const landDruid2 = character({
      choices: {
        classSelections: {
          class_druid: { druid_level_1_cantrips: ["spell_barkskin", "spell_dancing_lights"] },
        },
        traitSelections: {
          human_language_choice: ["elvish"],
          druid_starting_skills: ["arcana", "insight"],
        },
        feats: [],
      },
    });
    const { levelUp } = await setup(landDruid2, [druid(2, "subclass_druid_land")]);

    const result = await levelUp({
      targetClassId: "class_druid",
      newTotalLevel: 3,
      selectedTraits: {
        druid_land_level_3_circle_land: ["trait_land_circle_spells_forest"],
      },
    });

    expect(result.status).toBe(200);
  });

  // a stored subclass is a locked answer: F1's scoping (#84) must not let a
  // level-up swap it out from under the character (G1)
  it("refuses to swap a stored subclass for a different one", async () => {
    const landDruid3 = character({
      choices: {
        classSelections: {
          class_druid: {
            druid_level_1_cantrips: ["spell_barkskin", "spell_dancing_lights"],
            druid_land_level_3_circle_land: ["trait_land_circle_spells_forest"],
          },
        },
        traitSelections: {
          human_language_choice: ["elvish"],
          druid_starting_skills: ["arcana", "insight"],
        },
        feats: [],
      },
    });
    const { levelUp } = await setup(landDruid3, [druid(3, "subclass_druid_land")]);

    const result = await levelUp({
      targetClassId: "class_druid",
      newTotalLevel: 4,
      subclassId: "subclass_druid_moon",
      featId: "feat_alert",
      selectedTraits: {
        druid_level_4_cantrips: ["spell_thaumaturgy"],
      },
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      "Invalid character choices: class_druid already has subclass subclass_druid_land",
    );
  });

  it("gives a bard dip's roster skill pick its whole roster, held skills marked", async () => {
    const { options, levelUp } = await setup(character(), [fighter(3, "subclass_fighter_champion")]);

    const { choiceQuestions } = await options({ classId: "class_bard" });
    const skill = choiceQuestions.find((question) => question.id === "bard_multiclass_skill");
    expect(skill?.options.map((option) => option.id)).toEqual(
      expect.arrayContaining(["athletics", "stealth", "arcana"]),
    );
    expect(skill?.held).toEqual(expect.arrayContaining(["athletics", "perception"]));

    const result = await levelUp({
      targetClassId: "class_bard",
      newTotalLevel: 4,
      ...answerAll(choiceQuestions),
    });
    expect(result.status).toBe(200);
  });

  it("lets an older character with an open creation question level up without answering it", async () => {
    const older = character({
      choices: {
        classSelections: {
          class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
        // fighter_starting_skills and human_language_choice were never answered
        traitSelections: {},
        feats: [],
      },
    });
    const { options, levelUp } = await setup(older, [fighter(2)]);

    const { choiceQuestions } = await options({
      classId: "class_fighter",
      subclassId: "subclass_fighter_champion",
    });
    expect(choiceQuestions).toEqual([]);

    const result = await levelUp({
      targetClassId: "class_fighter",
      newTotalLevel: 3,
      subclassId: "subclass_fighter_champion",
    });
    expect(result.status).toBe(200);
  });

  it("rejects a level total that disagrees with the class ledger (#90)", async () => {
    const { options, levelUp } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 7,
      featId: "feat_alert",
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe(
      "Invalid character choices: newTotalLevel 7 does not match the class ledger (4)",
    );
  });

  it("writes the level derived from the ledger, not the one the request sent (#90)", async () => {
    const { options, levelUp, sets } = await setup(humanCleric(), [cleric(3)]);
    const { choiceQuestions } = await options({ classId: "class_cleric" });

    const result = await levelUp({
      targetClassId: "class_cleric",
      newTotalLevel: 4,
      featId: "feat_alert",
      ...answerAll(choiceQuestions),
    });

    expect(result.status).toBe(200);
    const written = sets.find(
      (value): value is { level: unknown } =>
        typeof value === "object" && value !== null && "level" in value,
    );
    expect(written).toBeDefined();
    expect(written!.level).toBe(4);
  });

  it("returns no questions without a character in scope", async () => {
    const { app } = await setup(character(), [fighter(2)]);

    const response = await request(app)
      .get("/api/reference/level-up/options")
      .query({ classId: "class_fighter", currentClassLevel: "2" });

    expect(response.status).toBe(200);
    expect(response.body.choiceQuestions).toEqual([]);
  });
});
