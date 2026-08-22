import { z } from "zod";

/**
 * How a value grows with level.
 *
 * Lived on modifiers.ts, which meant dice.ts and actions.ts imported the
 * modifier module to describe scaling that has nothing to do with modifiers.
 */
export const ModifierScalingSchema = z.enum([
  "total_level",
  "class_level",
  "class_level_thresholds",
  "none",
]);

/**
 * One rung of a level-gated ladder.
 *
 * The shape is shared; the value constraint is not. A modifier threshold may
 * carry any number, a resource threshold must be a non-negative count, and
 * merging those would have to take the looser of the two and stop rejecting a
 * fractional charge count.
 *
 * `minimumLevel` is `.positive()` because levels start at 1. This tightens the
 * old ResourceThreshold, which allowed 0; no pack file authors 0.
 * @param valueSchema What this ladder's rungs carry
 * @returns A strict {minimumLevel, value} schema
 */
export const thresholdOf = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      minimumLevel: z.number().int().positive(),
      value: valueSchema,
    })
    .strict();

export const ModifierScalingThresholdSchema = thresholdOf(z.number());
export const ResourceThresholdSchema = thresholdOf(
  z.number().int().nonnegative(),
);

export type ModifierScaling = z.infer<typeof ModifierScalingSchema>;
export type ModifierScalingThreshold = z.infer<
  typeof ModifierScalingThresholdSchema
>;
export type ResourceThreshold = z.infer<typeof ResourceThresholdSchema>;
