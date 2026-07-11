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

export const ClassProgressionSchema = z
  .object({
    classId: z.string().min(1),
    level: z.number().int().min(1).max(20),
    subclassRequirementLevel: z.number().int().min(1).max(3),
    subclassId: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    // strictly require subclass selection if character level meets threshold guardrail
    if (data.level >= data.subclassRequirementLevel && !data.subclassId) {
      ctx.addIssue({
        code: "custom",
        message: `A subclass must be selected for this class at level ${data.subclassRequirementLevel} or higher.`,
        path: ["subclassId"],
      });
    }
  });

// #endregion

// #region Unified Character Engine Schema

export const CharacterEngineSchema = z.object({
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
  classes: z.array(ClassProgressionSchema).min(1), // multiclass

  // live state
  hp: z.object({
    max: z.number().int().positive(),
    current: z.number().int().min(0),
    temporary: z.number().int().min(0).default(0),
  }),

  // aggregate modifiers
  globalModifiers: RuntimeModifiersListSchema,
});

export type CharacterEngineData = z.infer<typeof CharacterEngineSchema>;

export const BaseCharacterSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  flavor: CharacterFlavorSchema,
  engine: CharacterEngineSchema,
});

export type Character = z.infer<typeof BaseCharacterSchema>;

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
