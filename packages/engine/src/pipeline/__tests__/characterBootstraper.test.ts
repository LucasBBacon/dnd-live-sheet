import { describe, expect, it, vi } from "vitest";
import type { CharacterSave, CoreRulePackSnapshot } from "@project/shared";
import { CharacterBootstrapper } from "../characterBootstrapper.js";
import { ModifierExtractor } from "../modifierExtractor.js";
import { ProficiencyExtractor } from "../proficiencyExtractor.js";
import { corePackSnapshot } from "./corePackFixture.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

const codes = (save: CharacterSave) =>
  CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot()).map((issue) => issue.code);

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
  // the dwarf's Tool Proficiency block is a trait choice, not a class node
  traitSelections: {
    dwarf_artisan_tools: ["smiths_tools"],
    // the fighter's own Skill Proficiencies choice block, now authored
    fighter_starting_skills: ["athletics", "perception"],
  },
  feats: [],
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
  // humans get one extra language of their choice, plus the warlock's own
  // Skill Proficiencies choice block, now authored
  traitSelections: {
    human_language_choice: ["dwarvish"],
    warlock_starting_skills: ["arcana", "history"],
  },
  feats: [],
  hp: baseHp,
});

// cantrips from the pack's roster; the spells-known nodes are left unanswered
// - they offer nothing until #31a gives the pack's spells real levels
const warlock3 = (invocations: string[], boon = "trait_pact_of_the_blade") =>
  warlock(3, {
    warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
    warlock_level_2_invocations: invocations,
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
        CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot())[0]!.message,
      ).toContain("level 5");
    });

    it("rejects an invocation whose pact boon was not taken", () => {
      const save = warlock3(
        ["trait_invocation_book_of_ancient_secrets", "trait_invocation_devils_sight"],
        "trait_pact_of_the_blade",
      );
      const issue = CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot())[0]!;
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
        "spell_dancing_lights",
        "spell_minor_illusion",
      ];
      const issue = CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot())[0]!;
      expect(issue.code).toBe("unmet_prerequisite");
      expect(issue.message).toContain("spell_eldritch_blast");
    });

    // an invocation's requiredSpellIds must see every active trait's spell
    // pick, not only a race trait's or this class's own traits - a feat's
    // trait counts too (#79)
    it("counts a feat's trait spell pick toward an invocation's spell prerequisite", () => {
      const snapshot: CoreRulePackSnapshot = {
        ...corePackSnapshot(),
        featsById: {
          ...corePackSnapshot().featsById,
          feat_test_cantrip: {
            id: "feat_test_cantrip",
            name: "Test Cantrip Feat",
            category: "general",
            repeatable: false,
            lore: {
              shortDescription: "A test-only feat whose trait carries a spell pick.",
            },
            grantedTraitIds: ["trait_test_feat_cantrip"],
            tags: [],
          },
        },
        traitsById: {
          ...corePackSnapshot().traitsById,
          trait_test_feat_cantrip: {
            id: "trait_test_feat_cantrip",
            name: "Test Feat Cantrip",
            lore: { shortDescription: "Grants a test-only cantrip pick." },
            isStartingProficiency: false,
            modifiers: { fixed: [], choices: [] },
            spells: {
              fixed: [],
              choices: [
                {
                  type: "spell_choice",
                  nodeId: "test_feat_cantrip",
                  listSource: "warlock",
                  maxSpellLevel: 0,
                  pickCount: 1,
                },
              ],
            },
            resources: [],
            triggers: [],
            diceRules: [],
            criticalHitModifiers: [],
            actions: [],
          },
        },
      };

      const save = warlock3([
        "trait_invocation_agonizing_blast",
        "trait_invocation_devils_sight",
      ]);
      // Eldritch Blast is known only through the feat's trait pick here, not
      // a warlock cantrip
      save.classes[0]!.selections.warlock_level_1_cantrips = [
        "spell_minor_illusion",
        "spell_dancing_lights",
      ];
      save.feats = ["feat_test_cantrip"];
      save.traitSelections.test_feat_cantrip = ["spell_eldritch_blast"];

      expect(CharacterBootstrapper.collectSaveIssues(save, snapshot)).toEqual([]);
    });
  });
});

describe("CharacterBootstrapper.validateSave", () => {
  it("does not throw on a valid save", () => {
    expect(() => CharacterBootstrapper.validateSave(fighter(), corePackSnapshot())).not.toThrow();
  });

  it("throws a single message for a single problem", () => {
    expect(() =>
      CharacterBootstrapper.validateSave(fighter({ level: 3 }), corePackSnapshot()),
    ).toThrow(/requires a subclass selection at level 3/);
  });

  it("lists every problem when there is more than one", () => {
    const save = fighter({ classId: "class_fighter", level: 3, selections: {} });
    save.race = {
      baseRaceId: "race_owlbear",
      hasSubraces: false,
      subraceId: null,
    };
    expect(() => CharacterBootstrapper.validateSave(save, corePackSnapshot())).toThrow(
      /Invalid character save:[\s\S]*Unknown race[\s\S]*subclass/,
    );
  });
});

describe("CharacterBootstrapper.collectSaveIssues - trait choice blocks", () => {
  /** a half-elf fighter: two ability bumps, two skills, one bonus language */
  const halfElf = (
    traitSelections: Record<string, string[]>,
  ): CharacterSave => ({
    attributes: baseAttributes,
    race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
    classes: [
      {
        classId: "class_fighter",
        level: 1,
        selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
    ],
    traitSelections,
    feats: [],
    hp: baseHp,
  });

  const answered = {
    half_elf_asi_choice: ["DEX", "CON"],
    skill_versatility_choice: ["stealth", "perception"],
    half_elf_language_choice: ["dwarvish"],
    // the fighter's own Skill Proficiencies choice block, now authored
    fighter_starting_skills: ["athletics", "history"],
  };

  it("accepts a save with every trait block answered", () => {
    expect(codes(halfElf(answered))).toEqual([]);
  });

  it("requires a selection for a block the character has unlocked", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(halfElf({}), corePackSnapshot());

    expect(issues.map((i) => i.code)).toEqual([
      "missing_selection",
      "missing_selection",
      "missing_selection",
      "missing_selection",
    ]);
    expect(issues.map((i) => i.nodeId)).toContain("half_elf_asi_choice");
    expect(issues.map((i) => i.nodeId)).toContain("fighter_starting_skills");
  });

  it("rejects a pick the block does not offer", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(
      halfElf({ ...answered, half_elf_asi_choice: ["DEX", "CHA"] }),
      corePackSnapshot(),
    );

    // CHA is off the half-elf block: it already gets the fixed +2
    expect(issues.map((i) => i.code)).toEqual(["invalid_option"]);
    expect(issues[0]!.traitId).toBe("race_half_elf_asi");
  });

  it("rejects a language the character is already given for free", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(
      halfElf({ ...answered, half_elf_language_choice: ["elvish"] }),
      corePackSnapshot(),
    );

    expect(issues.map((i) => i.code)).toEqual(["redundant_selection"]);
    expect(issues[0]!.message).toMatch(/already has/);
  });

  it("flags the wrong number of picks", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(
      halfElf({ ...answered, half_elf_asi_choice: ["DEX"] }),
      corePackSnapshot(),
    );

    expect(issues.map((i) => i.code)).toEqual(["wrong_selection_count"]);
  });

  it("reports a repeated pick once, without also calling it over the limit", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(
      halfElf({ ...answered, half_elf_asi_choice: ["DEX", "DEX"] }),
      corePackSnapshot(),
    );

    expect(issues.map((i) => i.code)).toEqual(["duplicate_selection"]);
  });

  it("flags picks stored against a block no trait offers", () => {
    const issues = CharacterBootstrapper.collectSaveIssues(
      halfElf({ ...answered, dwarf_artisan_tools: ["smiths_tools"] }),
      corePackSnapshot(),
    );

    expect(issues.map((i) => i.code)).toEqual(["orphan_selection"]);
    expect(issues[0]!.nodeId).toBe("dwarf_artisan_tools");
  });

  it("stays quiet about trait blocks when the race itself is broken", () => {
    const save = halfElf({});
    save.race = { baseRaceId: "race_nonsense", hasSubraces: false, subraceId: null };

    // the missing race is the real problem; the traits it would have granted
    // must not each turn into their own issue
    expect(codes(save)).toEqual(["unknown_race"]);
  });

  it("agrees with what the extractors actually applied", () => {
    const save = halfElf({ ...answered, half_elf_language_choice: ["elvish"] });
    const traits = CharacterBootstrapper.compileActiveTraits(save, corePackSnapshot());
    const selections = CharacterBootstrapper.resolveSelections(save);

    // validation says the pick is wasted, and the sheet agrees it was ignored
    expect(codes(save)).toEqual(["redundant_selection"]);
    expect(
      ProficiencyExtractor.extractProficiencies(traits, selections).filter(
        (g) => g.category === "languages",
      ),
    ).toHaveLength(2); // common + elvish, both from the fixed grant
  });
});

describe("CharacterBootstrapper.collectSaveIssues - spell choices", () => {
  const issuesAt = (
    save: CharacterSave,
    nodeId: string,
    snapshot: CoreRulePackSnapshot = corePackSnapshot(),
  ) =>
    CharacterBootstrapper.collectSaveIssues(save, snapshot)
      .filter((issue) => issue.nodeId === nodeId)
      .map((issue) => issue.code);

  /**
   * The pack with only its level-0 spells - today the whole pack (#31a), built
   * explicitly so "no spell of level 1 or above" keeps meaning that.
   */
  const cantripsOnly = (): CoreRulePackSnapshot => {
    const snapshot = corePackSnapshot();
    return {
      ...snapshot,
      spellsById: Object.fromEntries(
        Object.entries(snapshot.spellsById).filter(
          ([, spell]) => spell.level === 0,
        ),
      ),
    };
  };

  const human = { baseRaceId: "race_human", hasSubraces: false, subraceId: null };
  const tiefling = { baseRaceId: "race_tiefling", hasSubraces: false, subraceId: null };
  const highElf = { baseRaceId: "race_elf", hasSubraces: true, subraceId: "subrace_elf_high" };
  const cantrips = ["spell_dancing_lights", "spell_minor_illusion", "spell_eldritch_blast"];

  /** a level-1 wizard of the given race, with the given picks */
  const wizard = (
    race: CharacterSave["race"],
    selections: Record<string, string[]>,
    traitSelections: Record<string, string[]> = {},
  ): CharacterSave => ({
    attributes: baseAttributes,
    race,
    classes: [{ classId: "class_wizard", level: 1, selections }],
    traitSelections,
    feats: [],
    hp: baseHp,
  });

  it("accepts cantrips picked from the node's roster", () => {
    const save = wizard(human, { wizard_level_1_cantrips: cantrips });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual([]);
  });

  it("rejects a spell the node does not offer", () => {
    const save = wizard(human, {
      wizard_level_1_cantrips: ["spell_dancing_lights", "spell_minor_illusion", "spell_not_real"],
    });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual(["invalid_option"]);
  });

  it("rejects a pick the character already knows from a trait", () => {
    // Thaumaturgy comes with the tiefling's Infernal Legacy
    const save = wizard(tiefling, {
      wizard_level_1_cantrips: ["spell_thaumaturgy", "spell_minor_illusion", "spell_dancing_lights"],
    });
    expect(issuesAt(save, "wizard_level_1_cantrips")).toEqual(["redundant_selection"]);
  });

  it("reports an unanswered spell node, but not one with nothing to offer", () => {
    const save = wizard(human, {});
    expect(issuesAt(save, "wizard_level_1_cantrips", cantripsOnly())).toEqual(["missing_selection"]);
    expect(issuesAt(save, "wizard_level_1_spellbook", cantripsOnly())).toEqual([]);
  });

  it("rejects every pick on a spell node with nothing to offer", () => {
    const save = wizard(human, {
      wizard_level_1_cantrips: cantrips,
      wizard_level_1_spellbook: [
        "spell_bless",
        "spell_command",
        "spell_identify",
        "spell_augury",
        "spell_suggestion",
        "spell_nondetection",
      ],
    });
    expect(issuesAt(save, "wizard_level_1_spellbook", cantripsOnly())).toEqual(
      Array(6).fill("invalid_option"),
    );
  });

  it("accepts a High Elf's cantrip, which is not an orphan", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_thaumaturgy"],
    });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual([]);
  });

  it("reports a High Elf's cantrip left unanswered", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual(["missing_selection"]);
  });

  it("rejects a High Elf's cantrip the block does not offer, or one too many", () => {
    const notOffered = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_not_real"],
    });
    const tooMany = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_thaumaturgy", "spell_command"],
    });

    expect(issuesAt(notOffered, "high_elf_cantrip")).toEqual(["invalid_option"]);
    expect(issuesAt(tooMany, "high_elf_cantrip")).toEqual(["wrong_selection_count"]);
  });

  it("rejects a High Elf's cantrip the wizard already picked", () => {
    const save = wizard(highElf, { wizard_level_1_cantrips: cantrips }, {
      high_elf_cantrip: ["spell_dancing_lights"],
    });
    expect(issuesAt(save, "high_elf_cantrip")).toEqual(["redundant_selection"]);
  });

  it("meets an invocation's spell prerequisite with a trait's spell pick", () => {
    const save: CharacterSave = {
      ...warlock3([
        "trait_invocation_agonizing_blast",
        "trait_invocation_devils_sight",
      ]),
      race: highElf,
      traitSelections: {
        high_elf_cantrip: ["spell_eldritch_blast"],
        warlock_starting_skills: ["arcana", "history"],
      },
    };
    save.classes[0]!.selections.warlock_level_1_cantrips = [
      "spell_minor_illusion",
      "spell_dancing_lights",
    ];

    expect(issuesAt(save, "warlock_level_2_invocations")).toEqual([]);
  });
});

describe("CharacterBootstrapper.resolveGrantedTraitIds", () => {
  it("includes race, subrace, starting proficiencies and selections", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot());

    expect(ids).toContain("race_dwarf_darkvision"); // race
    expect(ids).toContain("dwarven_toughness"); // subrace
    expect(ids).toContain("trait_fighter_prof_armor"); // starting proficiency
    expect(ids).toContain("trait_second_wind"); // level 1 grant
    expect(ids).toContain("trait_fs_defense"); // the fighting style chosen
    expect(new Set(ids).size).toBe(ids.length); // de-duplicated
  });

  it("does not include features from levels the character has not reached", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot());
    expect(ids).not.toContain("trait_action_surge"); // level 2
  });

  it("includes subclass grants once a subclass is chosen", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      fighter({
        level: 3,
        subclassId: "subclass_fighter_champion",
      }),
      corePackSnapshot(),
    );
    expect(ids).toContain("trait_improved_critical");
  });

  it("includes the traits a preset background grants", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), backgroundId: "background_criminal" },
      corePackSnapshot(),
    );

    expect(ids).toEqual(
      expect.arrayContaining([
        "trait_criminal_prof_skills",
        "trait_criminal_prof_tools",
      ]),
    );
  });

  it("includes the traits of every feat taken", () => {
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), feats: ["feat_alert", "feat_mobile"] },
      corePackSnapshot(),
    );

    expect(ids).toEqual(
      expect.arrayContaining(["feat_alert", "trait_feat_mobile"]),
    );
  });

  it("grants nothing for a feat the pack does not define", () => {
    expect(
      CharacterBootstrapper.resolveGrantedTraitIds(
        { ...fighter(), feats: ["feat_not_real"] },
        corePackSnapshot(),
      ),
    ).toEqual(
      CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot()),
    );
  });

  // three sample characters carry backgrounds the pack does not define
  it("grants nothing for a background the pack does not define", () => {
    const withUnknown = CharacterBootstrapper.resolveGrantedTraitIds(
      { ...fighter(), backgroundId: "background_charlatan" },
      corePackSnapshot(),
    );

    expect(withUnknown).toEqual(
      CharacterBootstrapper.resolveGrantedTraitIds(fighter(), corePackSnapshot()),
    );
  });

  it("carries a background's fixed skills through to proficiency grants", () => {
    const save = { ...fighter(), backgroundId: "background_criminal" };
    const skills = ProficiencyExtractor.extractProficiencies(
      CharacterBootstrapper.compileActiveTraits(save, corePackSnapshot()),
      CharacterBootstrapper.resolveSelections(save),
    )
      .filter((grant) => grant.category === "skills")
      .map((grant) => grant.proficiencyId);

    expect(skills).toEqual(expect.arrayContaining(["deception", "stealth"]));
  });
});

describe("CharacterBootstrapper.hydrateRuntimeManagers effect kinds", () => {
  /** A trait whose only contribution is a permanent state. */
  const statefulTrait = () =>
    vi.spyOn(CharacterBootstrapper, "compileActiveTraits").mockReturnValue([
      {
        id: "trait_powerful_build",
        name: "Powerful Build",
        modifiers: { fixed: [], choices: [] },
        resources: [],
        diceRules: [],
        criticalHitModifiers: [],
        grantedStates: ["powerful_build"],
        triggers: [],
        actions: [],
      },
    ] as never);

  it("marks a trait-granted state as trait_state rather than as an effect", () => {
    const spy = statefulTrait();
    const effectManager = new EffectManager();

    CharacterBootstrapper.hydrateRuntimeManagers(
      fighter(),
      effectManager,
      new ResourceManager(),
    );

    // a permanent fact about the character, not an effect that expires. An
    // effects panel has to tell them apart, and matching on the instanceId
    // prefix would be the string hack removed elsewhere.
    const injected = effectManager
      .getActiveEffects()
      .find((effect) => effect.instanceId === "trait_state_trait_powerful_build");

    expect(injected).toBeDefined();
    expect(injected?.kind).toBe("trait_state");

    spy.mockRestore();
  });

  it("still grants the state itself", () => {
    const spy = statefulTrait();
    const effectManager = new EffectManager();

    CharacterBootstrapper.hydrateRuntimeManagers(
      fighter(),
      effectManager,
      new ResourceManager(),
    );

    expect(effectManager.getActiveStates()).toContain("powerful_build");

    spy.mockRestore();
  });
});

describe("CharacterBootstrapper pack resolution", () => {
  const barbarian = (): CharacterSave => ({
    attributes: baseAttributes,
    race: { baseRaceId: "race_dwarf", hasSubraces: false, subraceId: null },
    classes: [{ classId: "class_barbarian", level: 1, selections: {} }],
    traitSelections: {},
    feats: [],
    hp: baseHp,
  });

  const pack = {
    racesById: {
      race_dwarf: {
        id: "race_dwarf",
        name: "Dwarf",
        size: "medium" as const,
        speed: 25,
        grantedTraitIds: ["trait_pack_darkvision"],
        hasSubraces: false,
        subraces: {},
      },
    },
    classesById: {
      class_barbarian: {
        id: "class_barbarian",
        name: "Barbarian",
        hitDie: 12,
        subclassUnlockLevel: 3,
        startingEquipment: { given: [], choices: [] },
        startingProficiencyTraitIds: [],
        multiclassTraitIds: [],
        progression: [{ level: 1, grants: ["trait_rage"], grantsASI: false }],
      },
    },
    traitsById: {
      trait_rage: {
        id: "trait_rage",
        name: "Rage",
        modifiers: { fixed: [], choices: [] },
        resources: [],
        triggers: [],
        diceRules: [],
        criticalHitModifiers: [],
        actions: [],
      },
      trait_pack_darkvision: {
        id: "trait_pack_darkvision",
        name: "Darkvision",
        modifiers: { fixed: [], choices: [] },
        resources: [],
        triggers: [],
        diceRules: [],
        criticalHitModifiers: [],
        actions: [],
      },
    },
  };

  it("grants a race's traits from the pack", () => {
    expect(
      CharacterBootstrapper.resolveGrantedTraitIds(barbarian(), pack),
    ).toContain("trait_pack_darkvision");
  });

  it("grants a class's traits from the pack progression", () => {
    expect(
      CharacterBootstrapper.resolveGrantedTraitIds(barbarian(), pack),
    ).toContain("trait_rage");
  });

  it("grants nothing for a class no source defines", () => {
    // deliberately pack-less: class_barbarian exists only in the pack, so with
    // no snapshot there is nothing to grant. This is what the bridge state
    // looks like, and why the pack has to be supplied.
    expect(CharacterBootstrapper.resolveGrantedTraitIds(barbarian())).toEqual(
      [],
    );
  });

  it("compiles the pack's own trait definitions, not empty placeholders", () => {
    const compiled = CharacterBootstrapper.compileActiveTraits(
      barbarian(),
      pack,
    );

    expect(compiled.find((trait) => trait.id === "trait_rage")?.name).toBe(
      "Rage",
    );
  });

  it("still compiles dictionary traits when no pack is supplied", () => {
    const compiled = CharacterBootstrapper.compileActiveTraits(fighter(), corePackSnapshot());

    expect(compiled.length).toBeGreaterThan(0);
  });

  it("hydrates resources from pack traits", () => {
    const resourceManager = new ResourceManager();

    CharacterBootstrapper.hydrateRuntimeManagers(
      barbarian(),
      new EffectManager(),
      resourceManager,
      pack,
    );

    // proves the snapshot reached the hydration path, not just the id lookup
    expect(() =>
      CharacterBootstrapper.hydrateRuntimeManagers(
        barbarian(),
        new EffectManager(),
        resourceManager,
        pack,
      ),
    ).not.toThrow();
  });
});

describe("CharacterBootstrapper.hydrateRuntimeManagers caster level", () => {
  // a class that declares spellcasting and grants a trait carrying a
  // caster_level_thresholds resource - the pack shape a real spellcaster
  // needs before ResourceManager can size their slots
  const wizardPack = {
    classesById: {
      class_wizard: {
        id: "class_wizard",
        name: "Wizard",
        hitDie: 6,
        subclassUnlockLevel: 2,
        startingEquipment: { given: [], choices: [] },
        startingProficiencyTraitIds: [],
        multiclassTraitIds: [],
        progression: [{ level: 1, grants: ["trait_spell_slots"], grantsASI: false }],
        spellcasting: {
          ability: "INT" as const,
          progression: "full" as const,
          startsAtLevel: 1,
        },
      },
    },
    traitsById: {
      trait_spell_slots: {
        id: "trait_spell_slots",
        name: "Spell Slots",
        modifiers: { fixed: [], choices: [] },
        resources: [
          {
            id: "resource_spell_slots_3",
            name: "3rd-Level Slots",
            resetCondition: "long_rest" as const,
            maxRule: {
              kind: "caster_level_thresholds" as const,
              thresholds: [{ minimumLevel: 5, value: 2 }],
            },
          },
        ],
        triggers: [],
        diceRules: [],
        criticalHitModifiers: [],
        actions: [],
      },
    },
  };

  const wizard5 = (): CharacterSave => ({
    attributes: baseAttributes,
    race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
    classes: [{ classId: "class_wizard", level: 5, selections: {} }],
    traitSelections: {},
    feats: [],
    hp: baseHp,
  });

  it("resolves a caster_level_thresholds pool from the character's real caster level", () => {
    const resourceManager = new ResourceManager();

    CharacterBootstrapper.hydrateRuntimeManagers(
      wizard5(),
      new EffectManager(),
      resourceManager,
      wizardPack,
    );

    const pool = resourceManager
      .getRuntimeResources()
      .find((resource) => resource.id === "resource_spell_slots_3");

    // a wizard 5 is caster level 5: two third-level slots. Left unpopulated,
    // ResourceManager has no caster level to read and this silently resolves
    // to 0 - the exact failure mode this test exists to catch.
    expect(pool?.maxCharges).toBe(2);
  });
});

describe("CharacterBootstrapper.collectChoiceIssues", () => {
  const codes = (save: CharacterSave) =>
    CharacterBootstrapper.collectChoiceIssues(save, corePackSnapshot()).map(
      (issue) => issue.code,
    );

  it("reports nothing for a save whose picks are all valid", () => {
    expect(codes(fighter())).toEqual([]);
  });

  // until the wizard asks a question, leaving it unanswered is expected
  it("does not report a question that has not been answered yet", () => {
    const save = fighter({ selections: {} });

    expect(
      CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot()).map(
        (issue) => issue.code,
      ),
    ).toContain("missing_selection");
    expect(codes(save)).toEqual([]);
  });

  it("reports an option the question does not offer", () => {
    const save = fighter({
      selections: { fighter_level_1_fighting_style: ["trait_fs_not_real"] },
    });

    expect(codes(save)).toContain("invalid_option");
  });

  it("reports a trait choice block given the wrong number of picks", () => {
    const save = {
      ...fighter(),
      traitSelections: {
        ...fighter().traitSelections,
        fighter_starting_skills: ["athletics"],
      },
    };

    expect(codes(save)).toContain("wrong_selection_count");
  });

  it("leaves issues that are not about choices to collectSaveIssues", () => {
    const save = {
      ...fighter(),
      race: { baseRaceId: "race_not_real", hasSubraces: false, subraceId: null },
    };

    expect(
      CharacterBootstrapper.collectSaveIssues(save, corePackSnapshot()).map(
        (issue) => issue.code,
      ),
    ).toContain("unknown_race");
    expect(codes(save)).not.toContain("unknown_race");
  });
});

describe("a stored trait selection reaches the modifiers", () => {
  it("turns a half-elf's ability score choice into +1 on each chosen ability", () => {
    const save: CharacterSave = {
      ...fighter(),
      race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    const plusOnes = ModifierExtractor.extractModifiers(
      CharacterBootstrapper.compileActiveTraits(save, corePackSnapshot()),
      CharacterBootstrapper.resolveSelections(save),
    ).filter(
      (modifier) =>
        modifier.type === "add" &&
        modifier.value === 1 &&
        ["STR", "DEX", "CON", "INT", "WIS"].includes(modifier.target),
    );

    expect(plusOnes.map((modifier) => modifier.target).sort()).toEqual([
      "CON",
      "DEX",
    ]);
  });
});
