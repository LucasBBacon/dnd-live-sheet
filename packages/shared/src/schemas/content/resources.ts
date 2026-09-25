import { z } from "zod";
import { ResourceThresholdSchema } from "../primitives/scaling.js";

/**
 * When a resource's charges come back.
 *
 * The union of the two enums this replaces. `RestCondition` (pack resources)
 * had long_rest_half and never; `ResourceReset` (trait resources) had
 * initiative_roll and start_of_turn. Neither contained the other, so a union is
 * the only merge that loses nothing.
 */
export const ResourceResetSchema = z.enum([
  "short_rest",
  "long_rest",
  "long_rest_half",
  "dawn",
  "never",
  "initiative_roll",
  "start_of_turn",
]);

export const ResourceMaxRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), value: z.number().int().nonnegative() }).strict(),
  z
    .object({
      kind: z.literal("total_level_thresholds"),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("class_level_thresholds"),
      classId: z.string(),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("caster_level_thresholds"),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
]);

/**
 * One charge pool, wherever it is authored.
 *
 * Replaces ResourceGrant (on traits, `resetOn`) and ResourceRule (on packs,
 * `resetCondition`). `resetCondition` wins because that is the name every pack
 * file already authors.
 */
export const ChargesResourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    resetCondition: ResourceResetSchema,
    maxRule: ResourceMaxRuleSchema,
    mode: z.literal("charges").optional(),
    /**
     * Marks the pool as spell slots, and at what level. Declared rather than
     * read off the id, as category tags are: the cast path spends a slot by
     * asking which pools are slots of at least the spell's level. A pact
     * pool's level is the warlock's pact slot level, which rises with
     * warlock level (SpellcastingEngine's pactSlotLevel).
     */
    spellSlot: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("level"),
            level: z.number().int().min(1).max(9),
          })
          .strict(),
        z.object({ kind: z.literal("pact") }).strict(),
      ])
      .optional(),
  })
  .strict();

export const UsesResourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    resetCondition: ResourceResetSchema,
    mode: z.literal("uses"),
  })
  .strict();

export const ResourceSchema = z.union([
  ChargesResourceSchema,
  UsesResourceSchema,
]);

export type ResourceReset = z.infer<typeof ResourceResetSchema>;
export type ResourceMaxRule = z.infer<typeof ResourceMaxRuleSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
