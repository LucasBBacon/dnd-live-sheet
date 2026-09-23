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

let moduleDbSelectCalls = 0;

const rowsFor = (table: Table) =>
  getTableName(table) === "character_classes" ? ledger : [character];

const chainableSelect = (onSelect: () => void) => () => {
  onSelect();
  return {
    from: (table: Table) => ({
      where: () => {
        const rows = rowsFor(table);
        return Object.assign(Promise.resolve(rows), {
          limit: () => Promise.resolve(rows),
          orderBy: () => Promise.resolve(rows),
        });
      },
    }),
  };
};

const getCachedRuleSnapshotMock = vi.fn(async () => ({
  cacheVersion: 1,
  loadedAt: 0,
  snapshot,
}));

const loadModule = async () => {
  vi.resetModules();
  moduleDbSelectCalls = 0;
  getCachedRuleSnapshotMock.mockClear();
  vi.doMock("@project/database", () => ({
    db: {
      select: chainableSelect(() => {
        moduleDbSelectCalls++;
      }),
    },
  }));
  vi.doMock("../ruleSnapshotCache.js", () => ({
    getCachedRuleSnapshot: getCachedRuleSnapshotMock,
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

  it("queries through a passed executor instead of the module db (#78 F1)", async () => {
    const { deriveMaxHp } = await loadModule();

    let stubSelectCalls = 0;
    const stubExecutor = {
      select: chainableSelect(() => {
        stubSelectCalls++;
      }),
    } as unknown as Parameters<typeof deriveMaxHp>[1];

    await expect(deriveMaxHp("char-1", stubExecutor)).resolves.toBe(28);

    // both of deriveMaxHp's selects went through the stub, none through the
    // module db - proving a caller's transaction executor is actually used
    expect(stubSelectCalls).toBe(2);
    expect(moduleDbSelectCalls).toBe(0);
  });

  it("uses a supplied snapshot instead of consulting the cache (#89 final review, F2)", async () => {
    const { deriveMaxHp } = await loadModule();

    // same fixture as the first test - the derived number must not change
    // just because the snapshot arrived as a parameter instead of a cache
    // hit. Cast like stubExecutor above: CoreRulePackSnapshot has no
    // equipmentById, which RulesSnapshotPayload requires, but this fixture
    // never reaches equipment - the same gap the mocked getCachedRuleSnapshot
    // above already carries at runtime, just now type-checked at the call site
    await expect(
      deriveMaxHp(
        "char-1",
        undefined,
        snapshot as unknown as Parameters<typeof deriveMaxHp>[2],
      ),
    ).resolves.toBe(28);

    // a caller that already resolved the snapshot (to hoist it out of a
    // transaction, #89 final review F2) must not have deriveMaxHp fetch it
    // again - that fetch is exactly the cache-miss-inside-a-transaction path
    // this fix removes
    expect(getCachedRuleSnapshotMock).not.toHaveBeenCalled();
  });
});
