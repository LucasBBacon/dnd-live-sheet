import z from "zod";
import { ActionGrantSchema, AreaOfEffectSchema } from "./actions.js";
import { ModifierScalingSchema, ModifierTargetSchema } from "./modifiers.js";
import { LoreSchema } from "../primitives/lore.js";

export const SpellSchoolSchema = z.enum([
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
]);

export const SpellComponentSchema = z.object({
  verbal: z.boolean().default(false),
  somatic: z.boolean().default(false),
  material: z.boolean().default(false),
  materialDescription: z.string().optional(),
  goldCost: z.number().default(0),
  isConsumed: z.boolean().default(false),
});

/**
 * Where a spell reaches. `touch`, `sight` and `unlimited` arrive with the
 * first spell that needs one; the repo adds no variant before a real rule.
 *
 * `area` is the spell's area, authored once, here. The spell synthesizer
 * copies it onto the spell's save, so the save line the table reads names it.
 */
export const SpellRangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("feet"),
      feet: z.number().int().positive(),
      area: AreaOfEffectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("self"),
      area: AreaOfEffectSchema.optional(),
    })
    .strict(),
]);

/**
 * How long a spell lasts. `concentration` is display here; the rule itself is
 * the `isSelfConcentration` effect the spell's action applies, and pack
 * validation requires the two to agree.
 */
export const SpellDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("instantaneous") }).strict(),
  z
    .object({
      kind: z.literal("timed"),
      amount: z.number().int().positive(),
      unit: z.enum(["minute"]),
      concentration: z.boolean(),
    })
    .strict(),
]);

/** Rounds in one unit of a timed duration: a round is six seconds. */
export const ROUNDS_PER_DURATION_UNIT = { minute: 10 } as const;

export const SpellDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().min(0).max(9), // 0 = cantrip
  school: SpellSchoolSchema,
  isRitual: z.boolean().default(false),
  // a spell fundamentally grants an  action to the character
  action: ActionGrantSchema,

  /**
   * What the table needs to know to cast it. Optional on the schema because a
   * stub carries none of them; pack validation requires all four on every
   * authored spell (validateSpells).
   */
  lore: LoreSchema.optional(),
  range: SpellRangeSchema.optional(),
  components: SpellComponentSchema.optional(),
  duration: SpellDurationSchema.optional(),

  /**
   * Declares a spell that exists only so references to it resolve.
   *
   * The same marker TraitImplementationMetadataSchema.mode carries, and for
   * the same reason: a spell must exist for a domain list or an invocation
   * prerequisite to validate, but its action has not been authored. Without
   * the marker a placeholder action is indistinguishable from a real one, and
   * a spell that silently does nothing is the exact failure this project keeps
   * having to unpick.
   *
   * Optional rather than defaulted - a `.default()` would make the field
   * required on the inferred output type and every authored spell literal
   * would have to restate it.
   */
  implementation: z
    .object({
      mode: z.literal("unimplemented"),
      summary: z.string(),
    })
    .optional(),
});

export type SpellDefinition = z.infer<typeof SpellDefinitionSchema>;
export type SpellRange = z.infer<typeof SpellRangeSchema>;
export type SpellDuration = z.infer<typeof SpellDurationSchema>;
export type SpellComponents = z.infer<typeof SpellComponentSchema>;

// #region Spell Grant Schemas

/**
 * How a granted spell is paid for.
 * - at_will: no cost (racial cantrips, some invocations)
 * - always_prepared: cast with the character's own slots, and does not count
 *   against a prepared caster's daily limit (domain and oath spells)
 * - resource: spends a Resource declared on the same trait, which is what
 *   carries the reset condition ("once per day" is dawn, not long_rest)
 */
export const SpellUsageSchema = z
  .object({
    kind: z.enum(["at_will", "always_prepared", "resource"]),
    resourceId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "resource" && !data.resourceId) {
      ctx.addIssue({
        code: "custom",
        message:
          "A resource-limited spell must name the resource that pays for it.",
        path: ["resourceId"],
      });
    }
  });

export const FixedSpellGrantSchema = z.object({
  type: z.literal("fixed_spell"),
  spellId: z.string(), // e.g., "spell_thaumaturgy"
  // omit to use the granting class's own spellcasting ability; racial spells
  // set it explicitly (e.g., "CHA" for Tiefling, "INT" for High Elf)
  castingStat: ModifierTargetSchema.optional(),
  // level at which the spell becomes available, if it is not granted up front
  unlockLevel: z.number().int().min(1).max(20).optional(),
  // which level unlockLevel counts against: character level or the level of the
  // class that granted the trait
  unlockScaling: ModifierScalingSchema.exclude(["none"]).default("total_level"),
  usage: SpellUsageSchema,
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
  // as above: omit to use the granting class's spellcasting ability
  castingStat: ModifierTargetSchema.optional(),
});

/**
 * The spell equivalent of the fixed/choices pairs on TraitDefinition.
 */
export const SpellGrantBlockSchema = z.object({
  fixed: z.array(FixedSpellGrantSchema).default([]),
  choices: z.array(SpellChoiceNodeSchema).default([]),
});

export type SpellUsage = z.infer<typeof SpellUsageSchema>;
export type FixedSpellGrant = z.infer<typeof FixedSpellGrantSchema>;
export type SpellChoiceNode = z.infer<typeof SpellChoiceNodeSchema>;
export type SpellGrantBlock = z.infer<typeof SpellGrantBlockSchema>;

// #endregion
