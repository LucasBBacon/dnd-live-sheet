import { describe, expect, it } from "vitest";
import type { LevelUpPayload } from "@project/shared";
import {
  resolveNextLevelValidationContextFromSnapshot,
  type ResolverNextLevelContext,
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
  decisionTypes: [],
  decisions,
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

  it("requires exactly one path for asi_or_feat", () => {
    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: basePayload,
        context: configuredContext([
          {
            id: "dec_asi",
            type: "asi_or_feat",
            description: "ASI or feat",
            isRequired: true,
            quantity: 1,
          },
        ]),
      }),
    ).toThrow("You must allocate Ability Score Improvements or select a Feat.");

    expect(() =>
      validateLevelUpPayloadFromResolver({
        payload: {
          ...basePayload,
          asiChoices: [{ stat: "str", value: 2 }],
          featId: "feat_alert",
        },
        context: configuredContext([
          {
            id: "dec_asi",
            type: "asi_or_feat",
            description: "ASI or feat",
            isRequired: true,
            quantity: 1,
          },
        ]),
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

describe("resolveNextLevelValidationContextFromSnapshot", () => {
  const makeSnapshot = () =>
    ({
      classes: [
        {
          id: "class_fighter",
          subclassRequirementLevel: 3,
        },
      ],
      classLevelsByClassId: new Map([
        [
          "class_fighter",
          [
            {
              classId: "class_fighter",
              level: 1,
            },
          ],
        ],
      ]),
      classTraitsByClassLevel: new Map([
        [
          "class_fighter::1",
          [
            {
              id: "trait_full_level_one",
              name: "Full Level One",
              effects: [],
            },
          ],
        ],
      ]),
      multiclassTraitsByClassId: new Map([
        [
          "class_fighter",
          [
            {
              id: "trait_multiclass_level_one",
              name: "Multiclass Level One",
              effects: [],
            },
          ],
        ],
      ]),
      subclassesByClassId: new Map(),
      subclassById: new Map(),
      subclassTraitsBySubclassLevel: new Map(),
    }) as any;

  it("returns standard level trait grants when not multiclass", () => {
    const context = resolveNextLevelValidationContextFromSnapshot({
      cache: makeSnapshot(),
      classId: "class_fighter",
      currentClassLevel: 0,
      isMulticlassDip: false,
    });

    expect(context.grantedTraitIds).toEqual(["trait_full_level_one"]);
  });

  it("returns multiclass trait grants for level-1 dip", () => {
    const context = resolveNextLevelValidationContextFromSnapshot({
      cache: makeSnapshot(),
      classId: "class_fighter",
      currentClassLevel: 0,
      isMulticlassDip: true,
    });

    expect(context.grantedTraitIds).toEqual(["trait_multiclass_level_one"]);
  });
});
