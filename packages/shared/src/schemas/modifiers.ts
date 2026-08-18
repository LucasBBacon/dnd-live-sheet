import z from "zod";

const AbilitySchema = z.enum(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);

// #region Modifier Schemas

export const ModifierTargetSchema = z.enum([
  "MAX_HP",
  "ARMOR_CLASS",
  "INITIATIVE",
  "SPEED",
  "ATTACK_BONUS",
  "DAMAGE_BONUS",
  "STR_SAVE",
  "DEX_SAVE",
  "CON_SAVE",
  "INT_SAVE",
  "WIS_SAVE",
  "CHA_SAVE",
  "ALL_SAVES",
  "POISON_SAVE",
  "CHARM_SAVE",
  "FRIGHTEN_SAVE",
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
  "STEALTH_CHECK",
  "SENSE_DARKVISION",
  "SPELLCASTING_MOD",
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
  "class_level_thresholds",
  "none",
]);

export const ModifierScalingThresholdSchema = z
  .object({
    minimumLevel: z.number().int().positive(),
    value: z.number(),
  })
  .strict();

export const ModifierAttackContextSchema = z.enum(["main_hand", "off_hand"]);
export const ModifierValueSourceSchema = z.enum([
  "fixed",
  "attack_ability_modifier",
  "governing_stat_modifier",
  "cha_modifier",
]);

export const ACFormulaSchema = z
  .object({
    kind: z.literal("ability_sum"),
    base: z.number().int(),
    abilities: z.array(AbilitySchema).min(1),
  })
  .strict();

export const BaseModifierSchema = z.object({
  target: ModifierTargetSchema,
  type: ModifierTypeSchema,
  value: z.number().default(0),
  valueSource: ModifierValueSourceSchema.optional(),
  scalingFactor: ModifierScalingSchema.default("none"),
  scalingClassId: z.string().optional(),
  scalingThresholds: z.array(ModifierScalingThresholdSchema).min(1).optional(),
  maxDexCap: z.number().optional(),
  formula: ACFormulaSchema.optional(),
  attackContext: ModifierAttackContextSchema.optional(),
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
});

export const ChoiceModifierGrantSchema = z.object({
  id: z.string(),
  chooseAmount: z.number().min(1).default(1),
  options: z.array(ModifierTargetSchema),
  modifierTemplate: z.object({
    type: ModifierTypeSchema,
    value: z.number(),
    valueSource: ModifierValueSourceSchema.optional(),
    scalingFactor: ModifierScalingSchema.default("none"),
    scalingClassId: z.string().optional(),
  }),
  allowDuplicates: z.boolean().default(false),
});

export const RuntimeModifierSchema = BaseModifierSchema.extend({
  id: z.string(),
  sourceName: z.string(), // e.g, "Tough Feat" or "Chain Mail"
  sourceOrigin: z.string(), // e.g., "trait", "item", "spell"
  isActive: z.boolean().default(true),
});

export const RuntimeModifiersListSchema = z
  .array(RuntimeModifierSchema)
  .default([]);

// #endregion

// #region Type Exports

export type ModifierTarget = z.infer<typeof ModifierTargetSchema>;
export type ModifierType = z.infer<typeof ModifierTypeSchema>;
export type ModifierScaling = z.infer<typeof ModifierScalingSchema>;
export type ModifierAttackContext = z.infer<typeof ModifierAttackContextSchema>;
export type ModifierValueSource = z.infer<typeof ModifierValueSourceSchema>;
export type ACFormula = z.infer<typeof ACFormulaSchema>;

export type TraitModifier = z.infer<typeof BaseModifierSchema>;
export type ChoiceModifierGrant = z.infer<typeof ChoiceModifierGrantSchema>;
export type RuntimeModifier = z.infer<typeof RuntimeModifierSchema>;
export type RuntimeModifiersList = z.infer<typeof RuntimeModifiersListSchema>;

export interface CalculationResult {
  total: number;
  breakdown: Array<{
    name: string;
    value: number | string;
    isIgnored?: boolean;
  }>;
}

// #endregion
