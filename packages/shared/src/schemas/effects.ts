import z from "zod";

// --------------------------------------------------------------
// SHARED BASE
// --------------------------------------------------------------
const BaseEffectSchema = z.object({
  levelAvailable: z.number().int().min(1).max(20).optional(),
  // TODO: wire predicates here (like armor restrictions)
});

// --------------------------------------------------------------
// EXPLICIT EFFECT IMPLEMENTATIONS
// --------------------------------------------------------------

export const SenseEffectSchema = BaseEffectSchema.extend({
  type: z.literal("sense"),
  target: z.string(), // e.g., 'darkvision', 'blindsight
  value: z.number().int(), // e.g., 60 ft
});

export const ProficiencyEffectSchema = BaseEffectSchema.extend({
  type: z.literal("proficiency"),
  category: z.enum([
    "armor",
    "weapons",
    "tools",
    "saving_throws",
    "skills",
    "languages",
  ]),
  item: z.string(), // e.g., 'skill_stealth', 'weapon_martial'
});

export const StatModifierEffectSchema = BaseEffectSchema.extend({
  type: z.literal("stat_modifier"),
  target: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  value: z.number().int(),
});

export const SpellGrantEffectSchema = BaseEffectSchema.extend({
  type: z.literal("spell_grant"),
  target: z.string(), // e.g., 'spell_firebolt'
  spellcastingAbility: z
    .enum(["str", "dex", "con", "int", "wis", "cha"])
    .optional(),
});

// explicit fallback for traits that require no engine hooks
export const OtherEffectSchema = BaseEffectSchema.extend({
  type: z.literal("other"),
  value: z.string().optional(), // optional metadata flag
});

// --------------------------------------------------------------
// DISCRIMINATED UNION
// --------------------------------------------------------------

export const TraitEffectSchema = z.discriminatedUnion("type", [
  SenseEffectSchema,
  ProficiencyEffectSchema,
  StatModifierEffectSchema,
  SpellGrantEffectSchema,
  OtherEffectSchema,
]);

export type TraitEffect = z.infer<typeof TraitEffectSchema>;
