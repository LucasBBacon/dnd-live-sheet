import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import { emptyCharacterChoices, toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import { finalMaxHp, toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * What each sample's sheet shows. Their stored maxHp is base rolled hit
 * points now (#78), so these are what the engine must derive from it: the
 * numbers they showed before the change, except Nyx Vale, whose Draconic
 * Resilience never reached a sheet.
 */
const EXPECTED_MAX_HP: Record<string, number> = {
  "Pip Underbough": 10,
  "Sister Aveline Cor": 24,
  "Grimnar Stonefist": 55,
  "Lyra Silverstring": 45,
  "Vaerix the Ashen": 85,
  "Nyx Vale": 78,
  "Master Ko Shen": 99,
  "Thistle Quickfoot": 86,
  "Kaelen Duskwarden": 152,
  "Dame Sable Orrin": 224,
  "Quill Ashgrove": 17,
  // Dwarven Toughness: +1 per level
  "Brannoc Hale": 31,
  "Isolde Varn": 31,
  // Tough: +2 per level
  "Ursk Gravemaw": 54,
  "Tamsin Burrowdeep": 65,
};

describe("sample character hit points", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s derives the maximum their sheet shows",
    (name, character) => {
      const save = toCharacterSave(
        {
          ...character,
          subraceId: character.subraceId ?? null,
          backgroundId: character.backgroundId ?? null,
        },
        character.classes.map((entry) => ({
          classId: entry.classId,
          classLevel: entry.classLevel,
          subclassId: entry.subclassId ?? null,
        })),
        character.choices ?? emptyCharacterChoices(),
      );

      expect(finalMaxHp(save, snapshot)).toBe(EXPECTED_MAX_HP[name]);
    },
  );
});
