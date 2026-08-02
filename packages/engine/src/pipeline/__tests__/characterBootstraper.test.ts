import { describe, expect, it } from "vitest";
import type { CharacterSave } from "@project/shared";
import { CharacterBootstrapper } from "../characterBootstraper.js";

const codes = (save: CharacterSave) =>
  CharacterBootstrapper.collectSaveIssues(save).map((issue) => issue.code);

const baseAttributes = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

const baseHp = {
  current: 10,
  temporary: 0,
  baseRolledHp: 10,
  hitDiceSpent: {},
};

/** a hill dwarf fighter 1, fully configured */
const fighter = (
  overrides: Partial<CharacterSave["classes"][number]> = {},
): CharacterSave => ({
  attributes: baseAttributes,
  race: {
    baseRaceId: "race_dwarf",
    hasSubraces: true,
    subraceId: "subrace_dwarf_hill",
  },
  classes: [
    {
      classId: "class_fighter",
      level: 1,
      selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      ...overrides,
    },
  ],
  traitSelections: {},
  hp: baseHp,
});

/** a warlock at the given level with pact boon and invocations filled in */
const warlock = (
  level: number,
  selections: Record<string, string[]>,
): CharacterSave => ({
  attributes: baseAttributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [
    {
      classId: "class_warlock",
      level,
      subclassId: "subclass_warlock_fiend",
      selections,
    },
  ],
  traitSelections: {},
  hp: baseHp,
});

const warlock3 = (invocations: string[], boon = "trait_pact_of_the_blade") =>
  warlock(3, {
    warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_prestidigitation"],
    warlock_level_1_spells_known: ["spell_hex", "spell_armor_of_agathys"],
    warlock_level_2_invocations: invocations,
    warlock_level_2_spells_known: ["spell_hellish_rebuke"],
    warlock_level_3_spells_known: ["spell_misty_step"],
    warlock_level_3_pact_boon: [boon],
  });

describe("CharacterBootstrapper.collectSaveIssues", () => {
  it("accepts a fully configured save", () => {
    expect(codes(fighter())).toEqual([]);
  });

  it("accepts a level 20 character", () => {
    const save = fighter({
      level: 20,
      subclassId: "subclass_fighter_champion",
      selections: {
        fighter_level_1_fighting_style: ["trait_fs_defense"],
        fighter_champion_level_10_fighting_style: ["trait_fs_archery"],
      },
    });
    expect(codes(save)).toEqual([]);
  });

  it("rejects a total level above 20", () => {
    const save = fighter({ level: 20, subclassId: "subclass_fighter_champion" });
    save.classes.push({
      classId: "class_rogue",
      level: 1,
      selections: {},
    });
    expect(codes(save)).toContain("total_level_exceeded");
  });

  describe("classes and subclasses", () => {
    it("rejects an unknown class id", () => {
      expect(codes(fighter({ classId: "class_bard_of_holding" }))).toEqual([
        "unknown_class",
      ]);
    });

    it("requires a subclass at the unlock level", () => {
      expect(codes(fighter({ level: 3 }))).toContain("missing_subclass");
    });

    it("rejects a subclass belonging to another class", () => {
      const save = fighter({
        level: 3,
        subclassId: "subclass_rogue_thief",
      });
      expect(codes(save)).toContain("subclass_class_mismatch");
    });

    it("rejects an unknown subclass", () => {
      const save = fighter({ level: 3, subclassId: "subclass_fighter_cook" });
      expect(codes(save)).toContain("unknown_subclass");
    });

    it("rejects the same class twice", () => {
      const save = fighter();
      save.classes.push({
        classId: "class_fighter",
        level: 1,
        selections: { fighter_level_1_fighting_style: ["trait_fs_archery"] },
      });
      expect(codes(save)).toContain("duplicate_class");
    });
  });

  describe("race", () => {
    it("rejects an unknown race", () => {
      const save = fighter();
      save.race = {
        baseRaceId: "race_owlbear",
        hasSubraces: false,
        subraceId: null,
      };
      expect(codes(save)).toEqual(["unknown_race"]);
    });

    it("requires a subrace when the race has them", () => {
      const save = fighter();
      save.race = {
        baseRaceId: "race_dwarf",
        hasSubraces: true,
        subraceId: null,
      };
      expect(codes(save)).toContain("missing_subrace");
    });

    it("rejects a subrace from another race", () => {
      const save = fighter();
      save.race = {
        baseRaceId: "race_dwarf",
        hasSubraces: true,
        subraceId: "subrace_elf_high",
      };
      expect(codes(save)).toContain("unknown_subrace");
    });

    it("rejects a subrace on a race that has none", () => {
      const save = fighter();
      save.race = {
        baseRaceId: "race_human",
        hasSubraces: false,
        subraceId: "subrace_dwarf_hill",
      };
      expect(codes(save)).toContain("unexpected_subrace");
    });

    it("rejects a hasSubraces flag that disagrees with the rulebook", () => {
      const save = fighter();
      save.race = {
        baseRaceId: "race_human",
        hasSubraces: true,
        subraceId: null,
      };
      expect(codes(save)).toContain("subrace_flag_mismatch");
    });
  });

  describe("choice nodes", () => {
    it("requires a selection for every unlocked node", () => {
      expect(codes(fighter({ selections: {} }))).toEqual(["missing_selection"]);
    });

    it("ignores nodes above the character's level", () => {
      // the champion's level 10 style is not unlocked for a level 3 fighter
      const save = fighter({
        level: 3,
        subclassId: "subclass_fighter_champion",
      });
      expect(codes(save)).toEqual([]);
    });

    it("rejects an option that is not on the node", () => {
      const save = fighter({
        selections: { fighter_level_1_fighting_style: ["trait_fs_beekeeping"] },
      });
      expect(codes(save)).toEqual(["invalid_option"]);
    });

    it("rejects the wrong number of selections", () => {
      const save = fighter({
        selections: {
          fighter_level_1_fighting_style: [
            "trait_fs_defense",
            "trait_fs_archery",
          ],
        },
      });
      expect(codes(save)).toContain("wrong_selection_count");
    });

    it("rejects the same option picked twice on one node", () => {
      const save = warlock3([
        "trait_invocation_devils_sight",
        "trait_invocation_devils_sight",
      ]);
      expect(codes(save)).toContain("duplicate_selection");
    });

    it("flags a selection for a node the character has not unlocked", () => {
      const save = fighter({
        selections: {
          fighter_level_1_fighting_style: ["trait_fs_defense"],
          fighter_bm_level_3_maneuvers: ["trait_maneuver_parry"],
        },
      });
      expect(codes(save)).toEqual(["orphan_selection"]);
    });
  });

  describe("prerequisites", () => {
    it("accepts an invocation whose pact requirement is met", () => {
      const save = warlock3([
        "trait_invocation_thirsting_blade",
        "trait_invocation_devils_sight",
      ]);
      // thirsting blade also needs warlock 5
      expect(codes(save)).toEqual(["unmet_prerequisite"]);
      expect(
        CharacterBootstrapper.collectSaveIssues(save)[0]!.message,
      ).toContain("level 5");
    });

    it("rejects an invocation whose pact boon was not taken", () => {
      const save = warlock3(
        ["trait_invocation_book_of_ancient_secrets", "trait_invocation_devils_sight"],
        "trait_pact_of_the_blade",
      );
      const issue = CharacterBootstrapper.collectSaveIssues(save)[0]!;
      expect(issue.code).toBe("unmet_prerequisite");
      expect(issue.message).toContain("trait_pact_of_the_tome");
    });

    it("accepts it once the matching pact boon is taken", () => {
      const save = warlock3(
        ["trait_invocation_book_of_ancient_secrets", "trait_invocation_devils_sight"],
        "trait_pact_of_the_tome",
      );
      expect(codes(save)).toEqual([]);
    });

    it("rejects an invocation needing a spell the character does not know", () => {
      const save = warlock3([
        "trait_invocation_agonizing_blast",
        "trait_invocation_devils_sight",
      ]);
      save.classes[0]!.selections.warlock_level_1_cantrips = [
        "spell_chill_touch",
        "spell_prestidigitation",
      ];
      const issue = CharacterBootstrapper.collectSaveIssues(save)[0]!;
      expect(issue.code).toBe("unmet_prerequisite");
      expect(issue.message).toContain("spell_eldritch_blast");
    });
  });
});

describe("CharacterBootstrapper.validateSave", () => {
  it("does not throw on a valid save", () => {
    expect(() => CharacterBootstrapper.validateSave(fighter())).not.toThrow();
  });

  it("throws a single message for a single problem", () => {
    expect(() =>
      CharacterBootstrapper.validateSave(fighter({ level: 3 })),
    ).toThrow(/requires a subclass selection at level 3/);
  });

  it("lists every problem when there is more than one", () => {
    const save = fighter({ classId: "class_fighter", level: 3, selections: {} });
    save.race = {
      baseRaceId: "race_owlbear",
      hasSubraces: false,
      subraceId: null,
    };
    expect(() => CharacterBootstrapper.validateSave(save)).toThrow(
      /Invalid character save:[\s\S]*Unknown race[\s\S]*subclass/,
    );
  });
});

describe("CharacterBootstrapper.resolveGrantedTraitIds", () => {
  it("includes race, subrace, starting proficiencies and selections", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(fighter());

    expect(ids).toContain("race_dwarf_darkvision"); // race
    expect(ids).toContain("dwarven_toughness"); // subrace
    expect(ids).toContain("trait_fighter_prof_armor"); // starting proficiency
    expect(ids).toContain("trait_second_wind"); // level 1 grant
    expect(ids).toContain("trait_fs_defense"); // the fighting style chosen
    expect(new Set(ids).size).toBe(ids.length); // de-duplicated
  });

  it("does not include features from levels the character has not reached", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(fighter());
    expect(ids).not.toContain("trait_action_surge"); // level 2
  });

  it("includes subclass grants once a subclass is chosen", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      fighter({
        level: 3,
        subclassId: "subclass_fighter_champion",
      }),
    );
    expect(ids).toContain("trait_improved_critical");
  });
});
