import { describe, expect, it } from "vitest";
import type { LevelUpPayload } from "@project/shared";
import {
  resolveNextLevelValidationContext,
  type ResolverNextLevelContext,
  validateMulticlassPrerequisites,
  assessMulticlassPrerequisites,
  validateLevelUpPayloadFromResolver,
} from "../levelUpValidation.js";

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

  it("validates trait_selection quantity from decision-keyed selectedTraits", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: {
            dec_skills: ["trait_prof_athletics"],
          } as unknown as string[],
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

  it("rejects a trait selection that is not on the decision's option list", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          selectedTraits: {
            fighter_level_1_fighting_style: ["trait_fs_beekeeping"],
          } as unknown as string[],
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

  it("validates spell_selection quantity", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          addedSpells: ["spell_magic_missile"],
        },
        context: configuredContext([
          {
            id: "dec_spells",
            type: "spell_selection",
            description: "Choose two spells",
            isRequired: true,
            quantity: 2,
          },
        ]),
      }),
    ).toThrow("You must select exactly 2 spell option(s)");
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
          } as unknown as string[],
          addedSpells: ["spell_magic_missile", "spell_shield"],
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
          {
            id: "dec_spells",
            type: "spell_selection",
            description: "Choose two spells",
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

    expect(context.grantedTraitIds).toEqual([
      "trait_fighter_mult_prof_armor",
      "trait_fighter_mult_prof_weapons",
    ]);
    expect(context.grantedTraits[0]?.grantSourceType).toBe("multiclass_grant");
  });

  it("returns no grants when a class has no multiclass traits", () => {
    const context = resolveNextLevelValidationContext({
      classId: "class_wizard",
      currentClassLevel: 0,
      isMulticlassDip: true,
    });

    expect(context.grantedTraitIds).toEqual([]);
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
    });

    it("turns a spell_choice node into a spell_selection decision", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_wizard",
        currentClassLevel: 0,
      });

      const cantrips = context.decisions.find(
        (d) => d.id === "wizard_level_1_cantrips",
      );
      expect(cantrips?.type).toBe("spell_selection");
      expect(cantrips?.quantity).toBe(3);

      const spellbook = context.decisions.find(
        (d) => d.id === "wizard_level_1_spellbook",
      );
      expect(spellbook?.quantity).toBe(6);
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

    it("raises no ASI or node decisions for a level-1 dip", () => {
      const context = resolveNextLevelValidationContext({
        classId: "class_fighter",
        currentClassLevel: 0,
        isMulticlassDip: true,
      });

      expect(
        context.decisions.some(
          (d) => d.id === "fighter_level_1_fighting_style",
        ),
      ).toBe(false);
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
