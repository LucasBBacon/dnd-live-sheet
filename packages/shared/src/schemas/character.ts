import { z } from "zod";

// ----------------------------------------------------------------------------------
// 1. Core primitives and modifiers
// ----------------------------------------------------------------------------------

// Modifiers must always be stored and parsed as lists to ensure map/reduce
// operations never throw "undefined is not a function" during stat calculation
export const ModifierSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  type: z.enum([
    "bonus",
    "advantage",
    "disadvantage",
    "resistance",
    "immunity",
  ]),
  target: z.string(),
  value: z.number().int().optional(),
});

export const ModifiersList = z.array(ModifierSchema).default([]);

// ----------------------------------------------------------------------------------
// 2. Progression and options (subrace / subclass enforcements)
// ----------------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------------
// 3. Unified character engine schema
// ----------------------------------------------------------------------------------

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
  globalModifiers: ModifiersList,
});

export type CharacterEngineData = z.infer<typeof CharacterEngineSchema>;
