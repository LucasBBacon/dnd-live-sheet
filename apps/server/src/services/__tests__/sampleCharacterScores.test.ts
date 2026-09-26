import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import {
  AbilityEngine,
  CharacterBootstrapper,
  EffectManager,
  gatherSheetModifiers,
} from "@project/engine";
import {
  emptyCharacterChoices,
  toRuleSnapshot,
  type CoreRulePackSnapshot,
} from "@project/shared";
import { toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/**
 * What each sample looks like on the sheet: the scores it stored before the
 * samples moved to pre-racial storage (#73). The stored scores plus the
 * race's bonuses must land exactly here.
 */
const INTENDED_FINAL: Record<string, number[]> = {
  "Pip Underbough": [8, 17, 14, 12, 10, 13],
  "Sister Aveline Cor": [13, 10, 15, 11, 17, 12],
  "Grimnar Stonefist": [18, 14, 17, 8, 12, 10],
  "Lyra Silverstring": [9, 16, 13, 12, 10, 18],
  "Vaerix the Ashen": [18, 10, 16, 10, 12, 16],
  "Nyx Vale": [8, 14, 14, 13, 10, 19],
  "Master Ko Shen": [12, 20, 16, 10, 18, 8],
  "Thistle Quickfoot": [8, 14, 14, 20, 13, 10],
  "Kaelen Duskwarden": [14, 18, 16, 10, 18, 8],
  "Dame Sable Orrin": [20, 14, 20, 10, 12, 14],
  // the scenario set was authored pre-racial from the start
  "Quill Ashgrove": [8, 16, 14, 15, 12, 10],
  "Brannoc Hale": [16, 12, 15, 10, 13, 8],
  "Isolde Varn": [8, 16, 14, 13, 10, 15],
  "Ursk Gravemaw": [17, 10, 14, 8, 10, 14],
  "Tamsin Burrowdeep": [16, 16, 16, 8, 12, 8],
  "Hesk Mossgather": [11, 13, 15, 11, 18, 9],
  "Seraphine Dusk": [8, 16, 8, 18, 12, 11],
  "Kestrel Vey": [10, 14, 14, 10, 12, 18],
  "Brother Mote": [14, 10, 14, 10, 20, 13],
  // the pack knows no Goliath, so nothing is added to the stored scores
  "Orrik Stonehide": [20, 12, 18, 8, 12, 10],
  "Maren Solace": [13, 10, 15, 11, 17, 12],
};

describe("sample character scores", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("covers every sample", () => {
    expect(ROSTER.map((character) => character.name).sort()).toEqual(
      Object.keys(INTENDED_FINAL).sort(),
    );
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s stores pre-racial scores that reach its intended final scores",
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
      // traits only: equipment (e.g. Grimnar's gauntlets) is not a racial bonus
      const modifiers = gatherSheetModifiers({
        activeTraits: CharacterBootstrapper.compileActiveTraits(save, snapshot),
        selections: CharacterBootstrapper.resolveSelections(save),
        inventory: [],
        effectManager: new EffectManager(),
        snapshot,
      });
      const stored = [
        character.str,
        character.dex,
        character.con,
        character.int,
        character.wis,
        character.cha,
      ];

      const final = ABILITIES.map(
        (ability, index) =>
          AbilityEngine.calculateScore(stored[index]!, ability, modifiers, [])
            .score,
      );

      expect(final).toEqual(INTENDED_FINAL[name]);
    },
  );
});
