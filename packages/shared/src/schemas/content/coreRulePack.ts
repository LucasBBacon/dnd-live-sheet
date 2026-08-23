import { z } from "zod";
import {
  BackgroundDefinitionSchema,
  ClassDefinitionSchema,
  ClassLevelFeatureSchema,
} from "./character.js";
import { EquipmentDefinitionSchema } from "./equipment.js";
import { FeatPrerequisitesSchema } from "./prerequisites.js";
import { ResourceSchema } from "./resources.js";
import { SpellDefinitionSchema } from "./spells.js";
import { TraitDefinitionSchema } from "./traits.js";
import { LoreSchema } from "../primitives/lore.js";
import { CoreRuleIdSchema } from "../primitives/ids.js";

const CoreSubraceSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    // Descriptive, not mechanical. Optional because the packs are being filled
    // in incrementally and no rule depends on it - tighten this once the PHB
    // content is complete.
    lore: LoreSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
  })
  .strict();

const CoreRaceSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]),
    speed: z.number().int().min(0).max(120),
    // see CoreSubraceSchema - descriptive, and the packs are incomplete
    lore: LoreSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
    hasSubraces: z.boolean(),
    // Keyed by subrace id, matching both the authored packs and the engine's
    // RaceDefinition. This was declared as an array and never agreed with
    // either, which is why no pack has ever validated.
    subraces: z.record(z.string(), CoreSubraceSchema).default({}),
  })
  .strict();

const CoreClassSchema = ClassDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
}).strict();

const CoreSubclassSchema = z
  .object({
    id: CoreRuleIdSchema,
    classId: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    lore: LoreSchema,
    progression: z.array(ClassLevelFeatureSchema).default([]),
  })
  .strict();

const CoreFeatSchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    category: z.string().min(1).max(50),
    source: z.string().min(1).max(100).optional(),
    repeatable: z.boolean().default(false),
    lore: LoreSchema,
    prerequisites: FeatPrerequisitesSchema.optional(),
    grantedTraitIds: z.array(CoreRuleIdSchema).default([]),
    tags: z.array(z.string().min(1).max(100)).default([]),
  })
  .strict();

const CoreTraitSchema = TraitDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
  isStartingProficiency: z.boolean().default(false),
}).strict();

/**
 * A facet of an item's rules that is authored as absent.
 *
 * - `weapon`: type "weapon" with no weapon block. Equips and weighs correctly,
 *   rolls no attack.
 * - `armor_class`: type "armor" with no ARMOR_CLASS modifier. Can be worn and
 *   grants nothing.
 * - `armor_category`: body armour with no armorCategory, so the rules that gate
 *   on light/medium/heavy - proficiency, Fast Movement - cannot see it.
 */
export const EquipmentGapSchema = z.enum([
  "weapon",
  "armor_class",
  "armor_category",
]);

/**
 * What an item is missing, declared by the item itself.
 *
 * Traits and spells carry a `mode` that says the rule is wholly absent. An
 * item's gaps are not wholesale - a battleaxe equips, weighs correctly and
 * carries its proficiency tags, and only its attack is missing - so this names
 * the missing facet instead. That is also what makes the gaps countable and
 * lets a test check the marker against the data rather than trusting it.
 *
 * Equipment was the only section that could not say any of this, which is how
 * 23 weapons that roll no attack and 6 armours that grant no AC sat in the pack
 * looking finished.
 *
 * Optional rather than defaulted, for the reason the trait and spell schemas
 * already record: a `.default()` makes the field required on the inferred
 * output type, so every authored equipment literal would have to restate it.
 * `gaps` is non-empty because an empty array would be a second way of spelling
 * "complete", and an absent marker already says that.
 */
export const EquipmentImplementationSchema = z
  .object({
    gaps: z.array(EquipmentGapSchema).min(1),
    summary: z.string().min(1),
  })
  .strict();

const CoreEquipmentSchema = EquipmentDefinitionSchema.extend({
  id: CoreRuleIdSchema,
  lore: LoreSchema,
  isBundle: z.boolean().default(false),
  bundleContents: z
    .array(
      z
        .object({
          itemId: CoreRuleIdSchema,
          quantity: z.number().int().min(1).max(1000),
        })
        .strict(),
    )
    .default([]),
  implementation: EquipmentImplementationSchema.optional(),
}).strict();

const CoreProficiencySchema = z
  .object({
    id: CoreRuleIdSchema,
    name: z.string().min(1).max(255),
    category: z.enum([
      "armor",
      "weapons",
      "tools",
      "saving_throws",
      "skills",
      "languages",
      "ability_check",
    ]),
  })
  .strict();

/**
 * The content sections a pack can claim to be complete for.
 *
 * Wider than CoreRulePackSchema's array fields because ownership is about
 * what a consumer may merge beneath this pack, not about pack arrays:
 * subraces are authored inside their race but are owned on their own terms.
 */
export const PackSectionSchema = z.enum([
  "traits",
  "resources",
  "races",
  "subraces",
  "classes",
  "subclasses",
  "feats",
  "backgrounds",
  "equipment",
  "spells",
  "proficiencies",
]);

export const CoreRulePackSchema = z
  .object({
    pack: z
      .object({
        packId: CoreRuleIdSchema,
        version: z.number().int().positive(),
        /**
         * The rules system this pack belongs to.
         *
         * No longer a literal: a pack may define an entirely different system,
         * and the database column has always been varchar. Packs whose
         * rulesets differ must never compose - that is what stops a homebrew
         * system silently falling back on the standard rules.
         */
        ruleset: z.string().min(1).max(100),
        publishedAt: z.iso.datetime({ offset: true }),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        /**
         * Packs this one layers on top of, in precedence order.
         *
         * An empty list means the pack stands alone. Absent means the same,
         * but says nothing deliberate about it.
         */
        extends: z.array(CoreRuleIdSchema).optional(),
        /**
         * Sections this pack is complete for, and therefore authoritative over.
         *
         * Nothing beneath an owned section merges into it. A supplement owns
         * nothing; a standalone system owns everything.
         *
         * Optional rather than defaulted: a `.default()` would make the field
         * required on the inferred output type, forcing every hand-written
         * pack literal in the tests to restate it.
         */
        owns: z.array(PackSectionSchema).optional(),
      })
      .strict(),
    traits: z.array(CoreTraitSchema).default([]),
    resources: z.array(ResourceSchema).default([]),
    races: z.array(CoreRaceSchema).default([]),
    classes: z.array(CoreClassSchema).default([]),
    subclasses: z.array(CoreSubclassSchema).default([]),
    feats: z.array(CoreFeatSchema).default([]),
    backgrounds: z.array(BackgroundDefinitionSchema).default([]),
    equipment: z.array(CoreEquipmentSchema).default([]),
    spells: z.array(SpellDefinitionSchema).default([]),
    proficiencies: z.array(CoreProficiencySchema).default([]),
  })
  .strict();

export type CoreRulePack = z.infer<typeof CoreRulePackSchema>;
export type CoreRulePackInput = z.input<typeof CoreRulePackSchema>;
export type EquipmentGap = z.infer<typeof EquipmentGapSchema>;
export type EquipmentImplementation = z.infer<
  typeof EquipmentImplementationSchema
>;
export type PackSection = z.infer<typeof PackSectionSchema>;
