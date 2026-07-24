import z from "zod";
import {
  BaseModifierSchema,
  ModifierScalingSchema,
  ModifierTargetSchema,
} from "./modifiers.js";
import { DamageTypeSchema } from "./affinities.js";
import { TargetFilterSchema } from "./creatures.js";

export const ActionActivationSchema = z.enum([
  "action",
  "bonus_action",
  "reaction",
  "special",
  "minute",
  "hour",
  "eight_hours",
]);

export const AreaOfEffectSchema = z.object({
  shape: z.enum([
    "cone",
    "line",
    "sphere",
    "cube",
    "cylinder",
    "single_target",
  ]),
  size: z.number(),
  secondarySize: z.number().optional(),
});

export const AttackTypeSchema = z.enum([
  "melee_weapon",
  "ranged_weapon",
  "melee_spell",
  "ranged_spell",
]);

export const ActionSaveSchema = z.object({
  targetStat: ModifierTargetSchema,
  dcCalculation: z.object({
    base: z.number().default(8),
    scalingStat: ModifierTargetSchema,
    includeProficiency: z.boolean().default(true),
  }),
  saveEffect: z.enum(["half_damage", "no_damage", "negates_effect"]),
});

export const DamageSegmentSchema = z.object({
  sourceName: z.string(),
  baseDice: z.string(),
  damageType: DamageTypeSchema,
  scalingMode: ModifierScalingSchema.default("none"),
  scalingClassId: z.string().optional(), // must be provided if mode is 'class_level'
  levelScaling: z
    .array(z.object({ levelRequired: z.number(), newDice: z.string() }))
    .default([]),
});

export const DamageRiderEffectSchema = z.object({
  type: z.literal("damage_rider"),
  requiredWeaponProperties: z.array(z.string()).default([]), // e.g., ['finesse', 'ranged']
  damage: z.array(DamageSegmentSchema),
});

export const SaveEffectSchema = z.object({
  type: z.literal("save"),
  areaOfEffect: AreaOfEffectSchema.optional(),
  savingThrow: ActionSaveSchema,
  damage: z.array(DamageSegmentSchema).optional(),
});

export const AttackEffectSchema = z.object({
  type: z.literal("attack"),
  attackType: AttackTypeSchema,
  attackStat: ModifierTargetSchema,
  range: z.number().default(5),
  longRange: z.number().optional(),
  damage: z.array(DamageSegmentSchema),
});

export const SummonEffectSchema = z.object({
  type: z.literal("summon"),
  entityTemplateIds: z.array(z.string()),
  maxActive: z.number().optional(),
  durationHours: z.number().optional(),
  materialCostGP: z.number().optional(),
});

export const ApplyStateEffectSchema = z.object({
  type: z.literal("apply_effect"),
  effectName: z.string().optional(), // defaults to the Action's name if omitted
  durationType: z.enum([
    "turn_start",
    "turn_end",
    "rounds",
    "rest_short",
    "rest_long",
    "manual",
  ]),
  durationRounds: z.number().optional(),
  isSelfConcentration: z.boolean().default(false),

  // math and flags to inject into EffectManager
  modifiers: z.array(BaseModifierSchema).default([]),
  states: z.array(z.string()).default([]),
});

export const DynamicWeaponAttackSchema = z.object({
  type: z.literal("dynamic_weapon_attack"),
  requiredWeaponProperties: z.array(z.string()).default([]),
  requiredWeaponCategory: z.array(z.string()).default([]),
});

export const CoreEffectUnion = z.discriminatedUnion("type", [
  SaveEffectSchema,
  AttackEffectSchema,
  DamageRiderEffectSchema,
  SummonEffectSchema,
  ApplyStateEffectSchema,
  DynamicWeaponAttackSchema,
]);

export const MacroEffectSchema = z.object({
  type: z.literal("macro"),
  effects: z.array(CoreEffectUnion),
});

export const ActionGrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  activation: ActionActivationSchema,
  consumesResource: z.string().optional(),
  targetFilter: TargetFilterSchema.optional(),
  effect: CoreEffectUnion,
});

export type ActionGrant = z.infer<typeof ActionGrantSchema>;
export type DamageSegment = z.infer<typeof DamageSegmentSchema>;
