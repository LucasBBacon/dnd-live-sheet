import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { ROSTER } from "@project/database/src/seedSampleCharacters.js";
import { CharacterBootstrapper } from "@project/engine";
import {
  emptyCharacterChoices,
  toRuleSnapshot,
  type CharacterSave,
  type CoreRulePackSnapshot,
} from "@project/shared";
import { toCharacterSave } from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

/**
 * The spell_choice nodes a save's classes and subclasses carry. The samples
 * leave them unanswered: every pack spell is a level-0 placeholder until
 * #31a, so the picks a sample could record (Bless as a cantrip) are ones
 * #31a would have to unpick.
 */
const spellChoiceNodeIds = (
  snapshot: CoreRulePackSnapshot,
  save: CharacterSave,
): Set<string> => {
  const ids = new Set<string>();
  for (const entry of save.classes) {
    const rows = [
      ...(snapshot.classesById[entry.classId]?.progression ?? []),
      ...(entry.subclassId
        ? (snapshot.subclassesById[entry.subclassId]?.progression ?? [])
        : []),
    ];
    for (const row of rows) {
      for (const grant of row.grants) {
        if (typeof grant !== "string" && grant.type === "spell_choice") {
          ids.add(grant.nodeId);
        }
      }
    }
  }
  return ids;
};

describe("sample character choices", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it.each(ROSTER.map((character) => [character.name, character] as const))(
    "%s answers every question the pack offers options for, and raises only the issues it declares",
    (_name, character) => {
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
      const spellNodes = spellChoiceNodeIds(snapshot, save);

      const issues = CharacterBootstrapper.collectSaveIssues(
        save,
        snapshot,
      ).filter(
        (issue) =>
          !(
            issue.code === "missing_selection" &&
            issue.nodeId !== undefined &&
            spellNodes.has(issue.nodeId)
          ),
      );

      // a character built to be broken declares what it raises; any other
      // issue is a mistake, and so is a declared one that went missing
      const expected = character.expectedIssues ?? [];

      expect(
        issues.filter((issue) => !expected.includes(issue.code)),
      ).toEqual([]);
      expect(issues.map((issue) => issue.code).sort()).toEqual(
        [...expected].sort(),
      );
    },
  );
});
