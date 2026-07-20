import z from "zod";
import { DamageTypeSchema } from "./affinities.js";
import { AttackTypeSchema } from "./actions.js";

export const DiceRuleTargetSchema = z.enum([
  "DAMAGE_ROLL",
  "ATTACK_ROLL",
  "SAVING_THROW",
  "ABILITY_CHECK",
]);

export const RNGMutatorTypeSchema = z.enum([
  "reroll_once",
  "minimum_value",
  "explode",
]);

export const RNGMutatorSchema = z.object({
  type: RNGMutatorTypeSchema,
  triggerOn: z.array(z.number()).optional(),
  floorValue: z.number().optional(),
});

export const DiceRuleSchema = z.object({
  target: DiceRuleTargetSchema,
  requiredStates: z.array(z.string()).default([]),
  requiredDamageType: DamageTypeSchema.optional(),
  mutator: RNGMutatorSchema,
});

export const CriticalHitModifierSchema = z.object({
  type: z.enum(["add_base_die", "add_specific_die", "maximize_dice"]),
  diceToAdd: z.string().optional(),
  damageType: DamageTypeSchema.optional(),
  requiredAttackTypes: z.array(AttackTypeSchema).default([]),
});

export type DiceRule = z.infer<typeof DiceRuleSchema>;
