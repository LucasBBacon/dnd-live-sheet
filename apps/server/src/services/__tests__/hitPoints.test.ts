import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { getTableName, type Table } from "drizzle-orm";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

let snapshot: CoreRulePackSnapshot;

const character = {
  id: "char-1",
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  backgroundId: null,
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  choices: { classSelections: {}, traitSelections: {}, feats: [] },
};

const ledger = [
  { classId: "class_fighter", classLevel: 1, subclassId: null },
];

const loadModule = async () => {
  vi.resetModules();
  vi.doMock("@project/database", () => ({
    db: {
      select: () => ({
        from: (table: Table) => ({
          where: () => {
            const rows =
              getTableName(table) === "character_classes" ? ledger : [character];
            return Object.assign(Promise.resolve(rows), {
              limit: () => Promise.resolve(rows),
              orderBy: () => Promise.resolve(rows),
            });
          },
        }),
      }),
    },
  }));
  vi.doMock("../ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: async () => ({ cacheVersion: 1, loadedAt: 0, snapshot }),
  }));
  return import("../hitPoints.js");
};

describe("deriveMaxHp", () => {
  beforeEach(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("derives base + Constitution per level + a trait's MAX_HP", async () => {
    const { deriveMaxHp } = await loadModule();

    // hill dwarf fighter 1: base 24, CON 16 (+3), Dwarven Toughness +1
    await expect(deriveMaxHp("char-1")).resolves.toBe(28);
  });
});
