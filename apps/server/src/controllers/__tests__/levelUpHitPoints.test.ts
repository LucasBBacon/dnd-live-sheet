import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { levelUpHitPointGain } from "../characterController.js";
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

describe("levelUpHitPointGain", () => {
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
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5 },
        snapshot,
      }),
    ).toBe(7);
  });

  it("counts an ability score increase that raises Constitution at this level", () => {
    // CON 14 -> 16 (17 as a human, +3): every level's contribution rises,
    // not just the new one
    expect(
      levelUpHitPointGain({
        saves: saves(),
        payload: { hpRoll: 5, asiChoices: [{ stat: "CON", value: 2 }] },
        snapshot,
      }),
    ).toBe(11);
  });
});
