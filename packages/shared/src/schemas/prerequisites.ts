import z from "zod";
import { AbilityMinimumsSchema } from "./primitives/ability.js";

// #region Ability Minimums

export { AbilityMinimumsSchema };

const hasAnyAbilityMinimum = (
  minimums: z.infer<typeof AbilityMinimumsSchema>,
) => Object.keys(minimums).length > 0;

// #endregion

// #region Multiclass Prerequisites

export const ClassMulticlassPrerequisitesSchema = z
  .object({
    abilityMinimums: AbilityMinimumsSchema.optional(),
    anyOf: z.array(AbilityMinimumsSchema).min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasAllOf =
      data.abilityMinimums !== undefined &&
      hasAnyAbilityMinimum(data.abilityMinimums);
    const hasAnyOf =
      data.anyOf !== undefined &&
      data.anyOf.some((minimums) => hasAnyAbilityMinimum(minimums));

    if (!hasAllOf && !hasAnyOf) {
      ctx.addIssue({
        code: "custom",
        message:
          "Class multiclass prerequisites must define abilityMinimums or anyOf.",
      });
    }

    data.anyOf?.forEach((minimums, index) => {
      if (!hasAnyAbilityMinimum(minimums)) {
        ctx.addIssue({
          code: "custom",
          message:
            "Each anyOf prerequisite entry must define at least one ability minimum.",
          path: ["anyOf", index],
        });
      }
    });
  });

// #endregion

// #region Feat Prerequisites

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

// #endregion

export type FeatPrerequisites = z.infer<typeof FeatPrerequisitesSchema>;
export type ClassMulticlassPrerequisites = z.infer<
  typeof ClassMulticlassPrerequisitesSchema
>;
