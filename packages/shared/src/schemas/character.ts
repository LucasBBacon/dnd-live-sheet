import { z } from "zod";
import { RuntimeModifiersListSchema } from "./modifiers.js";

// #region Core Primitives Schemas

// Flavor data: updates here do not trigger engine recalculations
export const CharacterFlavorSchema = z.object({
  name: z.string().min(1).max(100),
  alignment: z.string().optional(),
  eyeColor: z.string().optional(),
  backstory: z.string().max(5000).optional(),
});

export type CharacterFlavorData = z.infer<typeof CharacterFlavorSchema>;

export const FixedSpellGrantSchema = z.object({
  type: z.literal("fixed_spell"),
  spellId: z.string(), // e.g., "spell_thaumaturgy"
  castingStat: z.string().optional(), // e.g., "CHA" for Tiefling racial spells
  usesPerRest: z.number().optional(), // for things like "Cast once per long rest free"
});

export const SpellChoiceNodeSchema = z.object({
  type: z.literal("spell_choice"),
  nodeId: z.string(), // e.g., "wizard_level_2_spells"
  // "any" covers picks from every list at once (e.g., Bard Magical Secrets);
  // "arcane"/"divine" stay for grants that are not tied to a single class list
  listSource: z.enum([
    "any",
    "arcane",
    "divine",
    "bard",
    "cleric",
    "druid",
    "paladin",
    "ranger",
    "sorcerer",
    "warlock",
    "wizard",
  ]),
  maxSpellLevel: z.number().int(),
  pickCount: z.number().int(),
});

export const TraitGrantSchema = z.string();

export const FeatureGrantUnion = z.union([
  FixedSpellGrantSchema,
  SpellChoiceNodeSchema,
  TraitGrantSchema,
]);

// #endregion

// #region Progression and Options Schemas

export const RaceConfigurationSchema = z
  .object({
    baseRaceId: z.string().min(1),
    hasSubraces: z.boolean(),
    subraceId: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    // strictly require subrace selection where applicable guardrail
    if (data.hasSubraces && !data.subraceId) {
      ctx.addIssue({
        code: "custom",
        message: "A subrace must be explicitly selected for this base race.",
        path: ["subraceId"],
      });
    }
  });

export const ClassLevelFeatureSchema = z.object({
  level: z.number().int().min(1).max(20),
  // array of trait ids granted at this level (e.g., ["rogue_sneak_attack"])
  grants: z.array(FeatureGrantUnion).default([]),
  // true if this level grants an asi or feat
  grantsASI: z.boolean().default(false),
});

export const ClassDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  hitDie: z.number(), // e.g., 8 for d8
  subclassUnlockLevel: z.number().int().min(1).max(3),

  // what the class grants at lvl 1 (e.g., light armor, simple weapons)
  startingProficiencyTraitIds: z.array(z.string()).default([]),

  // 1-20 progression track
  progression: z.array(ClassLevelFeatureSchema),
});

export type FeatureGrant = z.infer<typeof FeatureGrantUnion>;
export type ClassLevelFeature = z.infer<typeof ClassLevelFeatureSchema>;
export type ClassDefinition = z.infer<typeof ClassDefinitionSchema>;

// #endregion

// #region Unified Character Engine Schema

export const CharacterClassStateSchema = z.object({
  classId: z.string().min(1),
  level: z.number().int().min(1).max(20),
  subclassId: z.string().optional(),

  // maps a choice id to selected option id(s)
  // e.g., {"fighter_fighting_style": ["archery"], "asi_level_4": ["feat_mobile"]}
  selections: z.record(z.string(), z.array(z.string())).default({}),
});

export const CharacterSaveSchema = z.object({
  // base attributes
  attributes: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),

  // progressions
  race: RaceConfigurationSchema,
  classes: z.array(CharacterClassStateSchema).min(1), // multiclass

  // live state
  hp: z.object({
    current: z.number().int().min(0),
    temporary: z.number().int().min(0).default(0),
    hitDiceSpent: z.record(z.string(), z.number()).default({}),
  }),
});

export type CharacterSave = z.infer<typeof CharacterSaveSchema>;

// #endregion

// #region Character Creation Payload

export const CreateCharacterPayloadSchema = z.object({
  campaignId: z.uuid().optional(),
  name: z.string().min(1, "Character name is required"),
  raceId: z.string(),
  subraceId: z.string().nullable(),

  // class configuration for lvl 1
  classId: z.string(),
  subclassId: z.string().nullable(),

  baseAbilityScores: z
    .object({
      str: z.number().int().min(3).max(18),
      dex: z.number().int().min(3).max(18),
      con: z.number().int().min(3).max(18),
      int: z.number().int().min(3).max(18),
      wis: z.number().int().min(3).max(18),
      cha: z.number().int().min(3).max(18),
    })
    .strict(),

  alignment: z.string(),

  background: z.object({
    type: z.enum(["PRESET", "CUSTOM"]),
    presetId: z.string().nullable(),
    customData: z
      .object({
        name: z.string(),
        featureName: z.string(),
        featureDescription: z.string(),
        skillTraitIds: z.array(z.string()),
        toolLanguageTraitIds: z.array(z.string()),
      })
      .nullable(),
  }),

  personality: z.object({
    traits: z.string(),
    ideals: z.string(),
    bonds: z.string(),
    flaws: z.string(),
  }),

  // flat array of finalized equipment choices from wizard
  startingEquipment: z
    .array(
      z.object({
        itemId: z.string(),
        quantity: z.number().int().min(1),
      }),
    )
    .default([]),
});

// #endregion

// #region Type Exports

export type CreateCharacterPayload = z.infer<
  typeof CreateCharacterPayloadSchema
>;

// #endregion
