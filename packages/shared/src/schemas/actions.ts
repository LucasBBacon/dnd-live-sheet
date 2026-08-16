import z from "zod";
import {
  BaseModifierSchema,
  ModifierAttackContextSchema,
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

export const WeaponAttackUsageSchema = z.enum(["standard", "two_weapon_bonus"]);

export const WeaponAttackContextSchema = z.object({
  hand: ModifierAttackContextSchema,
  attackUsage: WeaponAttackUsageSchema,
  isTwoHandedGrip: z.boolean().optional(),
});

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
  maximized: z.boolean().optional(),
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

export const AbilityCheckEffectSchema = z.object({
  type: z.literal("ability_check"),
});

export const AttackEffectSchema = z.object({
  type: z.literal("attack"),
  attackType: AttackTypeSchema,
  attackStat: ModifierTargetSchema,
  range: z.number().default(5),
  longRange: z.number().optional(),
  weaponContext: WeaponAttackContextSchema.optional(),
  attackBonus: z.number().optional(),
  damageBonus: z.number().optional(),
  criticalDamageMaximized: z.boolean().optional(),
  damage: z.array(DamageSegmentSchema),
});

export const SummonEffectSchema = z.object({
  type: z.literal("summon"),
  effectTag: z.string().optional(),
  entityTemplateIds: z.array(z.string()),
  maxActive: z.number().optional(),
  durationHours: z.number().optional(),
  materialCostGP: z.number().optional(),
});

const EffectStatePredicateSchema = z.object({
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
});

export const ApplyStateEffectSchema = z.object({
  type: z.literal("apply_effect"),
  effectName: z.string().optional(), // defaults to the Action's name if omitted
  effectTag: z.string().optional(),
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
  predicates: EffectStatePredicateSchema.optional(),
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

export const RemoveEffectSchema = z.object({
  type: z.literal("remove_effect"),
  effectTag: z.string().min(1),
});

export const DynamicWeaponAttackSchema = z.object({
  type: z.literal("dynamic_weapon_attack"),
  requiredWeaponProperties: z.array(z.string()).default([]),
  requiredWeaponCategory: z.array(z.string()).default([]),
});

export const CoreEffectUnion = z.discriminatedUnion("type", [
  SaveEffectSchema,
  AbilityCheckEffectSchema,
  AttackEffectSchema,
  DamageRiderEffectSchema,
  SummonEffectSchema,
  ApplyStateEffectSchema,
  RemoveEffectSchema,
  DynamicWeaponAttackSchema,
]);

export const MacroEffectSchema = z.object({
  type: z.literal("macro"),
  effects: z.array(CoreEffectUnion),
});

export const ActionEffectSchema = z.discriminatedUnion("type", [
  ...CoreEffectUnion.options,
  MacroEffectSchema,
]);

export const ActionGrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  activation: ActionActivationSchema,
  // a charge pool held by the ResourceManager, e.g. ki points
  consumesResource: z.string().optional(),
  // an ammo tag drawn from the character's inventory, e.g. "arrow". Kept apart
  // from consumesResource because ammunition is a physical stack the player
  // chooses from, not a pool of charges
  consumesAmmo: z.string().optional(),
  targetFilter: TargetFilterSchema.optional(),
  effect: ActionEffectSchema,
});

export type ActionGrant = z.infer<typeof ActionGrantSchema>;
export type DamageSegment = z.infer<typeof DamageSegmentSchema>;
export type WeaponAttackContext = z.infer<typeof WeaponAttackContextSchema>;
export type WeaponAttackUsage = z.infer<typeof WeaponAttackUsageSchema>;
