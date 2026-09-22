import { beforeAll, describe, expect, it } from "vitest";
import type { LevelUpPayload } from "@project/shared";
import {
  resolveNextLevelValidationContext,
  type ResolverNextLevelContext,
  validateMulticlassPrerequisites,
  assessMulticlassPrerequisites,
  validateLevelUpPayloadFromResolver,
} from "../levelUpValidation.js";
import { usePackRulebook } from "./packFixture.js";

// classes, subclasses and traits are resolved from the loaded pack now, so
// these pure functions need one primed before any of them can answer
beforeAll(usePackRulebook);

const basePayload: LevelUpPayload = {
  characterId: "char-1",
  targetClassId: "class_fighter",
  newTotalLevel: 4,
  hpRoll: 7,
};

const configuredContext = (
  decisions: ResolverNextLevelContext["decisions"],
): ResolverNextLevelContext => ({
  targetLevel: 4,
  isConfigured: true,
  reason: null,
  grantedTraitIds: [],
  grantedTraits: [],
  decisionTypes: [],
  decisions,
});

const scores = (overrides: Partial<Record<string, number>> = {}) => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  ...overrides,
});

describe("validateLevelUpPayloadFromResolver", () => {
  it("throws for non-configured next-level context", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: basePayload,
        context: {
          targetLevel: 8,
          isConfigured: false,
          reason: "Level 8 is not configured in class progression data.",
          grantedTraitIds: [],
          grantedTraits: [],
          decisionTypes: [],
          decisions: [],
        },
      }),
    ).toThrow("Level 8 is not configured");
  });

  it("requires subclass when resolver marks subclass decision", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: basePayload,
        context: configuredContext([
          {
            id: "dec_subclass",
            type: "subclass",
            description: "Choose a subclass",
            isRequired: true,
            quantity: 1,
          },
        ]),
      }),
    ).toThrow("A subclass selection is required");
  });

  it("rejects a subclass that belongs to another class", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: { ...basePayload, subclassId: "subclass_rogue_thief" },
        context: configuredContext([
          {
            id: "dec_subclass",
            type: "subclass",
            description: "Choose a subclass",
            isRequired: true,
            quantity: 1,
          },
        ]),
      }),
    ).toThrow("is not a subclass of class_fighter");
  });

  it("requires exactly one path for asi_or_feat", () => {
    const asiContext = configuredContext([
      {
        id: "dec_asi",
        type: "asi_or_feat",
        description: "ASI or feat",
        isRequired: true,
        quantity: 1,
      },
    ]);

    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: basePayload,
        context: asiContext,
      }),
    ).toThrow("You must allocate Ability Score Improvements or select a Feat.");

    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          asiChoices: [{ stat: "STR", value: 2 }],
          featId: "feat_alert",
        },
        context: asiContext,
      }),
    ).toThrow("You cannot select both Ability Score Improvements and a Feat");
  });

  it("rejects a featId when the level has no asi_or_feat decision", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: { ...basePayload, featId: "feat_alert" },
        context: configuredContext([]),
      }),
    ).toThrow();
  });

  it("rejects non-empty asiChoices when the level has no asi_or_feat decision", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          asiChoices: [{ stat: "STR", value: 2 }],
        },
        context: configuredContext([]),
      }),
    ).toThrow();
  });

  it("rejects featId and asiChoices together when the level has no asi_or_feat decision", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          featId: "feat_alert",
          asiChoices: [{ stat: "STR", value: 2 }],
        },
        context: configuredContext([]),
      }),
    ).toThrow();
  });

  it("validates trait_selection quantity from decision-keyed selectedTraits", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: {
            dec_skills: ["trait_prof_athletics"],
          },
        },
        context: configuredContext([
          {
            id: "dec_skills",
            type: "trait_selection",
            description: "Choose two skills",
            isRequired: true,
            quantity: 2,
          },
        ]),
      }),
    ).toThrow("You must select exactly 2 option(s)");
  });

  // selectedTraits is read only at the decision's own key (#82): a missing
  // key must not fall back to sweeping every other key's picks
  it("does not satisfy a decision from another key's picks in selectedTraits", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: {
            some_other_node: ["trait_prof_athletics", "trait_perception"],
          },
        },
        context: configuredContext([
          {
            id: "dec_skills",
            type: "trait_selection",
            description: "Choose two skills",
            isRequired: true,
            quantity: 2,
          },
        ]),
      }),
    ).toThrow("You must select exactly 2 option(s)");
  });

  it("satisfies a trait-choice-block decision from traitSelections, not selectedTraits", () => {
    const traitChoiceBlockContext = configuredContext([
      {
        id: "rogue_multiclass_skill",
        type: "trait_selection",
        description: "Choose proficiencies for Multiclass Skill Proficiency (Rogue).",
        options: ["acrobatics", "stealth"],
        isRequired: true,
        quantity: 1,
        source: "trait_choice_block",
      },
    ]);

    // the same answer filed under selectedTraits (the class-progression map)
    // does not satisfy a trait-choice-block decision
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: { rogue_multiclass_skill: ["stealth"] },
        },
        context: traitChoiceBlockContext,
      }),
    ).toThrow("You must select exactly 1 option(s)");

    // filed under traitSelections, it satisfies the decision
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          traitSelections: { rogue_multiclass_skill: ["stealth"] },
        },
        context: traitChoiceBlockContext,
      }),
    ).not.toThrow();
  });

  it("rejects a trait selection that is not on the decision's option list", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: {
            fighter_level_1_fighting_style: ["trait_fs_beekeeping"],
          },
        },
        context: configuredContext([
          {
            id: "fighter_level_1_fighting_style",
            type: "trait_selection",
            description: "Choose a fighting style",
            options: ["trait_fs_archery", "trait_fs_defense"],
            isRequired: true,
            quantity: 1,
          },
        ]),
      }),
    ).toThrow("trait_fs_beekeeping is not a valid option");
  });

  it("accepts valid payload for combined decision set", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          subclassId: "subclass_fighter_champion",
          featId: "feat_alert",
          selectedTraits: {
            dec_skills: ["trait_prof_athletics", "trait_perception"],
          },
        },
        context: configuredContext([
          {
            id: "dec_subclass",
            type: "subclass",
            description: "Choose subclass",
            isRequired: true,
            quantity: 1,
          },
          {
            id: "dec_asi",
            type: "asi_or_feat",
            description: "ASI or feat",
            isRequired: true,
            quantity: 1,
          },
          {
            id: "dec_skills",
            type: "trait_selection",
            description: "Choose two skills",
            isRequired: true,
            quantity: 2,
          },
        ]),
      }),
    ).not.toThrow();
  });
});

describe("resolveNextLevelValidationContext", () => {
  it("returns the class features granted at the target level", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_fighter",
      currentClassLevel: 1,
    });

    expect(context.isConfigured).toBe(true);
    expect(context.targetLevel).toBe(2);
    expect(context.grantedTraitIds).toEqual(["trait_action_surge"]);
    expect(context.grantedTraits[0]).toMatchObject({
      id: "trait_action_surge",
      grantSourceType: "class_progression",
    });
  });

  it("returns multiclass proficiency grants for a level-1 dip", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_fighter",
      currentClassLevel: 0,
      isMulticlassDip: true,
    });

    // the reduced multiclass proficiency set, plus the level's own string
    // feature grants - a dip still gets those (5e-correct)
    expect(context.grantedTraitIds).toEqual([
      "trait_fighter_mult_prof_armor",
      "trait_fighter_mult_prof_weapons",
      "trait_second_wind",
    ]);
    expect(context.grantedTraits[0]?.grantSourceType).toBe("multiclass_grant");
  });

  it("returns only the level's own feature grants when a class has no multiclass traits", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_wizard",
      currentClassLevel: 0,
      isMulticlassDip: true,
    });

    expect(context.grantedTraitIds).toEqual([
      "trait_spellcasting_wizard",
      "trait_arcane_recovery",
    ]);
  });

  it("marks levels outside 1-20 as not configured", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_fighter",
      currentClassLevel: 20,
    });

    expect(context.isConfigured).toBe(false);
    expect(context.reason).toContain("Level 21 is not configured");
  });

  it("marks an unknown class as not configured", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_beekeeper",
      currentClassLevel: 0,
    });

    expect(context.isConfigured).toBe(false);
    expect(context.reason).toContain("Unknown class");
  });

  describe("decisions", () => {
    it("raises a subclass decision at the class's unlock level", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 2,
      });

      expect(context.decisionTypes).toContain("subclass");
      const subclass = context.decisions.find((d) => d.type === "subclass");
      expect(subclass?.options).toEqual(
        expect.arrayContaining([
          "subclass_fighter_champion",
          "subclass_fighter_battle_master",
          "subclass_fighter_eldritch_knight",
        ]),
      );
    });

    it("raises an asi_or_feat decision from grantsASI", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 3,
      });

      expect(context.decisionTypes).toContain("asi_or_feat");
    });

    it("turns a trait_choice node into a trait_selection decision", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 0,
      });

      const decision = context.decisions.find(
        (d) => d.id === "fighter_level_1_fighting_style",
      );
      expect(decision?.type).toBe("trait_selection");
      expect(decision?.quantity).toBe(1);
      expect(decision?.options).toContain("trait_fs_archery");
      // a class-progression pick, not a trait's own choice block: answered
      // through selectedTraits
      expect(decision?.source).toBeUndefined();
    });

    it("marks a granted trait's own choice block as trait_choice_block, keyed for traitSelections", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_rogue",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      const decision = context.decisions.find(
        (d) => d.id === "rogue_multiclass_skill",
      );
      expect(decision?.type).toBe("trait_selection");
      expect(decision?.source).toBe("trait_choice_block");
      expect(decision?.options).toContain("stealth");
    });

    // spell picks are choice questions (listChoiceQuestions, #79), required
    // and stored like any class node's answer - not resolver decisions
    it("raises no decision for a spell_choice node", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_wizard",
        currentClassLevel: 0,
      });

      const ids = context.decisions.map((d) => d.id);
      expect(ids).not.toContain("wizard_level_1_cantrips");
      expect(ids).not.toContain("wizard_level_1_spellbook");
    });

    it("includes subclass decisions once a subclass is supplied", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 2,
        requestedSubclassId: "subclass_fighter_battle_master",
      });

      const maneuvers = context.decisions.find(
        (d) => d.id === "fighter_bm_level_3_maneuvers",
      );
      expect(maneuvers?.quantity).toBe(3);
      expect(maneuvers?.options).toContain("trait_maneuver_parry");
    });

    it("ignores a subclass that belongs to another class", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 2,
        requestedSubclassId: "subclass_rogue_thief",
      });

      expect(context.decisions.some((d) => d.id.startsWith("rogue"))).toBe(
        false,
      );
      expect(
        context.grantedTraits.some(
          (t) => t.grantSourceType === "subclass_progression",
        ),
      ).toBe(false);
    });

    it("raises no ASI decision for a level-1 dip", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      expect(context.decisionTypes).not.toContain("asi_or_feat");
    });

    // a dip still gets the class's own level-1 picks, which is 5e-correct -
    // a fighter dip gets Fighting Style just like a level-1 fighter does
    it("offers the class's own level-1 trait_choice decision and features on a dip", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      const decision = context.decisions.find(
        (d) => d.id === "fighter_level_1_fighting_style",
      );
      expect(decision?.type).toBe("trait_selection");
      expect(decision?.quantity).toBe(1);
      expect(decision?.options).toContain("trait_fs_archery");

      expect(context.grantedTraitIds).toEqual(
        expect.arrayContaining([
          "trait_fighter_mult_prof_armor",
          "trait_fighter_mult_prof_weapons",
          "trait_second_wind",
        ]),
      );
      expect(
        context.grantedTraits.find((t) => t.id === "trait_second_wind")
          ?.grantSourceType,
      ).toBe("class_progression");
    });

    it("raises no spell decision on a level-1 dip either", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_wizard",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      expect(context.decisions.map((d) => d.id)).not.toContain(
        "wizard_level_1_cantrips",
      );
    });

    // a subclass chosen at level 1 (a cleric's domain, a sorcerer's origin)
    // arrives with the dip itself, so its level-1 grants belong to the dip
    it("includes the subclass's level-1 trait_choice decisions on a dip", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_sorcerer",
        currentClassLevel: 0,
        isMulticlassDip: true,
        requestedSubclassId: "subclass_sorcerer_draconic",
      });

      const ancestor = context.decisions.find(
        (d) => d.id === "sorcerer_draconic_level_1_ancestor",
      );
      expect(ancestor?.type).toBe("trait_selection");
      expect(ancestor?.options).toContain("trait_dragon_ancestor_red");
      expect(context.grantedTraitIds).toContain("trait_draconic_resilience");
      expect(
        context.grantedTraits.find((t) => t.id === "trait_draconic_resilience")
          ?.grantSourceType,
      ).toBe("subclass_progression");
      expect(context.decisions.map((d) => d.id)).not.toContain(
        "sorcerer_level_1_cantrips",
      );
    });

    it("includes the choice blocks of a subclass's level-1 traits on a dip", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_cleric",
        currentClassLevel: 0,
        isMulticlassDip: true,
        requestedSubclassId: "subclass_cleric_knowledge",
      });

      expect(context.grantedTraitIds).toContain("trait_blessings_of_knowledge");
      expect(context.decisions.map((d) => d.id)).toEqual(
        expect.arrayContaining([
          "knowledge_domain_languages",
          "knowledge_domain_skills",
        ]),
      );
    });

    // a block with no options list offers its whole category roster; the
    // decision has to carry that roster or its picker (and its validation)
    // has nothing to offer
    it("gives a roster choice block's decision the category roster as options", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_bard",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      const skill = context.decisions.find(
        (d) => d.id === "bard_multiclass_skill",
      );
      expect(skill?.options).toEqual(
        expect.arrayContaining(["athletics", "stealth", "arcana"]),
      );
    });
  });
});

describe("multiclass prerequisites", () => {
  it("accepts all-of ability minimum rules", () => {
    expect(() =>
      validateMulticlassPrerequisites({
        classId: "class_ranger", // dex 13 and wis 13
        currentBaseScores: scores({ dex: 14, wis: 13 }),
      }),
    ).not.toThrow();
  });

  it("accepts any-of ability minimum rules", () => {
    expect(() =>
      validateMulticlassPrerequisites({
        classId: "class_fighter", // str 13 or dex 13
        currentBaseScores: scores({ dex: 13 }),
      }),
    ).not.toThrow();
  });

  it("rejects scores that do not satisfy multiclass prerequisites", () => {
    expect(() =>
      validateMulticlassPrerequisites({
        classId: "class_fighter",
        currentBaseScores: scores({ str: 12, dex: 12 }),
      }),
    ).toThrow("You do not meet the ability score prerequisites");
  });

  it("rejects an all-of rule when only one minimum is met", () => {
    expect(() =>
      validateMulticlassPrerequisites({
        classId: "class_ranger",
        currentBaseScores: scores({ dex: 14, wis: 10 }),
      }),
    ).toThrow("You do not meet the ability score prerequisites");
  });

  it("rejects missing multiclass prerequisite definitions", () => {
    expect(() =>
      validateMulticlassPrerequisites({
        classId: "class_beekeeper",
        currentBaseScores: scores({ str: 14 }),
      }),
    ).toThrow("Multiclass definitions not found");
  });

  it("covers every class in the rulebook", () => {
    for (const classId of [
      "class_barbarian",
      "class_bard",
      "class_cleric",
      "class_druid",
      "class_fighter",
      "class_monk",
      "class_paladin",
      "class_ranger",
      "class_rogue",
      "class_sorcerer",
      "class_warlock",
      "class_wizard",
    ]) {
      const assessment = assessMulticlassPrerequisites({
        classId,
        currentBaseScores: scores({
          str: 20,
          dex: 20,
          con: 20,
          int: 20,
          wis: 20,
          cha: 20,
        }),
      });
      expect(assessment.meetsPrerequisites, classId).toBe(true);
    }
  });
});
