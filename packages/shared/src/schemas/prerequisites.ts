import z from "zod";

export const AbilityMinimumsSchema = z.object({
  str: z.number().int().min(1).max(30).optional(),
  dex: z.number().int().min(1).max(30).optional(),
  con: z.number().int().min(1).max(30).optional(),
  int: z.number().int().min(1).max(30).optional(),
  wis: z.number().int().min(1).max(30).optional(),
  cha: z.number().int().min(1).max(30).optional(),
});

export const FeatPrerequisitesSchema = z
  .object({
    minimumLevel: z.number().int().min(1).max(20).optional(),
    abilityMinimums: AbilityMinimumsSchema.optional(),

    // remain in teh jsonb payload for ui evaluation during character creation
    requiredClassIds: z.array(z.string()).optional(),
    requiredSubclassIds: z.array(z.string()).optional(),
    requiredRaceIds: z.array(z.string()).optional(),
    requiredSubraceIds: z.array(z.string()).optional(),
    requiresSpellcasting: z.boolean().optional(),

    // included so the zod parser does not throw an error when reading
    // raw json file during ETL seed process, even though the database
    // primarily relies on the feat_prerequisites_feats junction table for this now
    requiredFeatIds: z.array(z.string()).optional(),
  })
  .strict();

export type FeatPrerequisites = z.infer<typeof FeatPrerequisitesSchema>;
