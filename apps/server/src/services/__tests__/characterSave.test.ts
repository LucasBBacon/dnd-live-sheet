import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assembleCoreRulePack } from "@project/database/pack";
import { toRuleSnapshot, type CoreRulePackSnapshot } from "@project/shared";
import {
  finalAbilityScores,
  finalMaxHp,
  readStoredChoices,
  toCharacterSave,
} from "../characterSave.js";

const PACK_DIR = path.join(
  process.cwd(),
  "../../packages/database/data/packs/core_2014_pack",
);

const row = (overrides: Record<string, unknown> = {}) => ({
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  ...overrides,
});

const fighterLedger = [
  { classId: "class_fighter", classLevel: 1, subclassId: null },
];

describe("toCharacterSave", () => {
  it("carries the character's background into the save", () => {
    const save = toCharacterSave(
      row({ backgroundId: "background_criminal" }),
      fighterLedger,
    );

    expect(save.backgroundId).toBe("background_criminal");
  });

  it("leaves the background off a character that has none", () => {
    const save = toCharacterSave(row({ backgroundId: null }), fighterLedger);

    expect("backgroundId" in save).toBe(false);
  });

  it("answers each class's questions from the stored choices", () => {
    const save = toCharacterSave(row(), fighterLedger, {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
      feats: [],
    });

    expect(save.classes[0]?.selections).toEqual({
      fighter_level_1_fighting_style: ["trait_fs_defense"],
    });
    expect(save.traitSelections).toEqual({
      fighter_starting_skills: ["athletics", "perception"],
    });
  });

  it("gives a class with no stored answers an empty selection map", () => {
    const save = toCharacterSave(row(), fighterLedger);

    expect(save.classes[0]?.selections).toEqual({});
    expect(save.traitSelections).toEqual({});
  });

  it("carries the feats taken into the save", () => {
    const save = toCharacterSave(row(), fighterLedger, {
      classSelections: {},
      traitSelections: {},
      feats: ["feat_alert"],
    });

    expect(save.feats).toEqual(["feat_alert"]);
  });
});

describe("readStoredChoices", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid stored value as parsed", () => {
    const stored = {
      classSelections: {},
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    expect(readStoredChoices(stored, "char-1")).toEqual({ ...stored, feats: [] });
  });

  it("treats a missing value as no answers", () => {
    expect(readStoredChoices(undefined, "char-1")).toEqual({
      classSelections: {},
      traitSelections: {},
      feats: [],
    });
  });

  // one bad row must not block a player's join
  it("logs a corrupt value against the character and treats it as empty", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(readStoredChoices({ classSelections: "nope" }, "char-9")).toEqual({
      classSelections: {},
      traitSelections: {},
      feats: [],
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("char-9"),
      expect.anything(),
    );
  });
});

describe("finalAbilityScores", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("adds racial bonuses to the stored, pre-racial scores", async () => {
    const save = toCharacterSave(
      row({
        raceId: "race_human",
        subraceId: null,
        str: 12,
        dex: 9,
        con: 14,
        int: 10,
        wis: 16,
        cha: 11,
      }),
      [{ classId: "class_cleric", classLevel: 3, subclassId: null }],
    );

    expect(finalAbilityScores(save, snapshot)).toEqual({
      str: 13,
      dex: 10,
      con: 15,
      int: 11,
      wis: 17,
      cha: 12,
    });
  });
});

describe("finalMaxHp", () => {
  let snapshot: CoreRulePackSnapshot;

  beforeAll(async () => {
    snapshot = toRuleSnapshot(await assembleCoreRulePack(PACK_DIR));
  });

  it("adds the Constitution modifier for every level, and a trait's own MAX_HP", () => {
    // a hill dwarf fighter 1: CON 14 + 2 = 16 (+3), base 24, and Dwarven
    // Toughness adds 1 per level
    const save = toCharacterSave(row(), fighterLedger);

    expect(finalMaxHp(save, snapshot)).toBe(28);
  });

  it("counts the Constitution modifier for every level of a multi-level class", () => {
    const save = toCharacterSave(
      row({
        raceId: "race_human",
        subraceId: null,
        con: 14,
        currentHp: 18,
        maxHp: 18,
      }),
      [{ classId: "class_cleric", classLevel: 3, subclassId: "subclass_cleric_life" }],
    );

    expect(finalMaxHp(save, snapshot)).toBe(24);
  });

  it("adds nothing for a Constitution modifier of zero", () => {
    // a human Draconic Bloodline sorcerer 3: CON 10 + 1 = 11 (+0), base 10.
    // A zero modifier adds nothing - the engine used to credit it with the
    // 1-per-level floor (#86) - and Draconic Resilience adds 1 per sorcerer
    // level (#87): 10 + 3
    const save = toCharacterSave(
      row({
        raceId: "race_human",
        subraceId: null,
        con: 10,
        currentHp: 10,
        maxHp: 10,
      }),
      [{ classId: "class_sorcerer", classLevel: 3, subclassId: "subclass_sorcerer_draconic" }],
    );

    expect(finalMaxHp(save, snapshot)).toBe(13);
  });
});
