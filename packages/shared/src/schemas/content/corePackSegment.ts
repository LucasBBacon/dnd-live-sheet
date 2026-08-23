import { z } from "zod";
import { CoreRulePackSchema } from "./coreRulePack.js";

/**
 * A `$schema` pointer, so a pack file can name the schema that describes it.
 *
 * Declared rather than stripped because both schemas below inherit `.strict()`
 * from CoreRulePackSchema, which would otherwise reject the very key that gives
 * pack authors editor completion.
 */
const SchemaPointerSchema = z.string().optional();

/**
 * Strips a shape's `.default()` wrappers before `.partial()` adds `.optional()`.
 *
 * Every content-section field on CoreRulePackSchema carries `.default([])`. In
 * this Zod version that default still fires for a key missing from the input
 * even after `.partial()` wraps the field in `.optional()` - so building the
 * segment shape straight from CoreRulePackSchema.omit({pack:true}).partial()
 * cannot make a section actually absent from a parsed segment; every untouched
 * section reappears as `[]` instead of staying out of the result. Removing the
 * default first, before `.partial()` runs, is Zod's own documented fix for
 * this interaction (`ZodDefault#removeDefault()`).
 */
const withoutDefaults = <Shape extends z.ZodRawShape>(shape: Shape) =>
  Object.fromEntries(
    Object.entries(shape).map(([key, fieldSchema]) => [
      key,
      fieldSchema instanceof z.ZodDefault
        ? fieldSchema.removeDefault()
        : fieldSchema,
    ]),
  ) as {
    [K in keyof Shape]: Shape[K] extends z.ZodDefault<infer Inner>
      ? Inner
      : Shape[K];
  };

/**
 * One segment file: a subset of a pack's content sections, and no envelope.
 *
 * Derived rather than restated so it cannot drift from the pack schema. The
 * inherited `.strict()` is the point: the assembler merges a fixed section list,
 * so today a segment with a mistyped section name contributes nothing and says
 * nothing about it.
 */
export const CorePackSegmentSchema = z
  .object(withoutDefaults(CoreRulePackSchema.omit({ pack: true }).shape))
  .strict()
  .partial()
  .extend({ $schema: SchemaPointerSchema });

/**
 * The pack's identity block plus the assembly metadata that never reaches the
 * pack itself.
 *
 * `segments` lives here and nowhere else: it tells the assembler what to read,
 * and CoreRulePackSchema.pack is strict, so it must be stripped before parsing.
 */
export const CorePackManifestSchema = CoreRulePackSchema.shape.pack.extend({
  segments: z.array(z.string()),
  $schema: SchemaPointerSchema,
});

export type CorePackSegment = z.infer<typeof CorePackSegmentSchema>;
export type CorePackManifest = z.infer<typeof CorePackManifestSchema>;
