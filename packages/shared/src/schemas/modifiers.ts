import z from "zod";

export const ModifierTargetSchema = z.enum([
  "MAX_HP",
  "ARMOR_CLASS",
  "INITIATIVE",
  "SPEED",
  "ATTACK_BONUS",
  "DAMAGE_BONUS",
  "STR_SAVE",
  "ALL_SAVES",
  "STEALTH_CHECK",
]);

export const ModifierTypeSchema = z.enum([
  "set_base", // Overrides base calc (e.g., mage armor AC 13)
  "add", // flat bonus (e.g., +1 ring of protection)
  "multiplier", // e.g, speed x 2
  "advantage",
  "disadvantage",
]);

export const ModifierScalingSchema = z.enum([
  "total_level",
  "class_level",
  "none",
]);

export const BaseModifierSchema = z.object({
  target: ModifierTargetSchema,
  type: ModifierTypeSchema,
  value: z.number().default(0),
  scalingFactor: ModifierScalingSchema.default("none"),
  maxDexCap: z.number().optional(),
});

export const RuntimeModifierSchema = BaseModifierSchema.extend({
  id: z.string(),
  sourceName: z.string(), // e.g, "Tough Feat" or "Chain Mail"
  sourceOrigin: z.string(), // e.g., "trait", "item", "spell"
  isActive: z.boolean().default(true),
});

export type ModifierTarget = z.infer<typeof ModifierTargetSchema>;
export type ModifierType = z.infer<typeof ModifierTypeSchema>;
export type ModifierScaling = z.infer<typeof ModifierScalingSchema>;

export type TraitModifier = z.infer<typeof BaseModifierSchema>;
export type RuntimeModifier = z.infer<typeof RuntimeModifierSchema>;

export interface CalculationResult {
  total: number;
  breakdown: Array<{
    name: string;
    value: number | string;
    isIgnored?: boolean;
  }>;
}
