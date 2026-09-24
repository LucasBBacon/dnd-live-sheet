import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { levelUpHitPoints } from "../characterController.js";
import { buildLevelUpSaves } from "../../services/characterSave.js";
import { emptyCharacterChoices } from "@project/shared";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/** a human cleric 3 with 18 base rolled hit points and CON 14 (15 as a human) */
const aveline = {
  raceId: "race_human",
  subraceId: null,
  backgroundId: null,
  str: 12,
  dex: 9,
  con: 14,
  int: 10,
  wis: 16,
  cha: 11,
  currentHp: 24,
  maxHp: 18,
};

const ledger = [
  { classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_life" },
];

describe("levelUpHitPoints", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  const saves = () =>
    buildLevelUpSaves({
      character: aveline,
      ledger,
      storedChoices: emptyCharacterChoices(),
      targetClassId: "class_cleric",
    });

  it("adds the roll and this level's Constitution modifier", () => {
    expect(
      levelUpHitPoints({
        saves: saves(),
        payload: { hpRoll: 5 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 5, gain: 7 });
  });

  it("counts an ability score increase that raises Constitution at this level", () => {
    // CON 14 -> 16 (17 as a human, +3): every level's contribution rises,
    // not just the new one
    expect(
      levelUpHitPoints({
        saves: saves(),
        payload: { hpRoll: 5, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toEqual({ storedRoll: 5, gain: 11 });
  });

  /** Aveline with a lower Constitution score (the row's, before her +1 as a human) */
  const savesWithCon = (con: number) =>
    buildLevelUpSaves({
      character: { ...aveline, con },
      ledger,
      storedChoices: emptyCharacterChoices(),
      targetClassId: "class_cleric",
    });

  it("lifts a low roll so the level still adds one hit point at CON 8 (#107)", () => {
    // CON 8 (-1): 18 - 3 = 15 before. A roll of 1 would add 1 - 1 = 0, so 2
    // is stored: 18 + 2 - 4 = 16 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(7),
        payload: { hpRoll: 1 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 2, gain: 1 });
  });

  it("lifts by the whole penalty at CON 6 (#107)", () => {
    // CON 6 (-2): 18 - 6 = 12 before; 3 is stored: 18 + 3 - 8 = 13 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(5),
        payload: { hpRoll: 1 },
        snapshot,
      }),
    ).toEqual({ storedRoll: 3, gain: 1 });
  });

  it("lifts against Constitution after this level's increase (#107)", () => {
    // CON 8 -> 10 with the increase: the modifier is 0, so a roll of 1
    // already adds 1 and nothing is lifted. 15 before; 18 + 1 + 0 = 19 after
    expect(
      levelUpHitPoints({
        saves: savesWithCon(7),
        payload: { hpRoll: 1, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toEqual({ storedRoll: 1, gain: 4 });
  });
});
