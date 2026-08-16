import z from "zod";

export const ResourceResetSchema = z.enum([
  "short_rest",
  "long_rest",
  "dawn",
  "initiative_roll",
  "start_of_turn",
]);

export const ResourceMaxRuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fixed"),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("class_level_thresholds"),
      classId: z.string(),
      thresholds: z
        .array(
          z
            .object({
              minimumLevel: z.number().int().positive(),
              value: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
]);

export const ResourceGrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  // maxCharges remains a compatibility input for existing authored traits;
  // new content should use maxRule, especially for level-scaled pools.
  maxCharges: z.number().int().nonnegative().optional(),
  maxRule: ResourceMaxRuleSchema.optional(),
  resetOn: ResourceResetSchema,
});

export type ResourceReset = z.infer<typeof ResourceResetSchema>;
export type ResourceMaxRule = z.infer<typeof ResourceMaxRuleSchema>;
export type ResourceGrant = z.infer<typeof ResourceGrantSchema>;
