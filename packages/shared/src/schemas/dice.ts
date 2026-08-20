import z from "zod";
import { DamageTypeSchema } from "./affinities.js";
import { AttackTypeSchema } from "./actions.js";
import {
  ModifierScalingSchema,
  ModifierScalingThresholdSchema,
} from "./modifiers.js";

export const DiceRuleTargetSchema = z.enum([
  "DAMAGE_ROLL",
  "ATTACK_ROLL",
  "SAVING_THROW",
  "ABILITY_CHECK",
]);

export type DiceRuleTarget = z.infer<typeof DiceRuleTargetSchema>;

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
  /**
   * How many extra dice `add_base_die` contributes. Absent means one.
   *
   * Optional rather than defaulted, unlike its opposite number on
   * BaseModifierSchema: these modifiers are written as hand-built literals in
   * the static dictionaries and in tests, and a `.default()` would make the
   * field *required* on the inferred output type, forcing every existing
   * single-die literal to restate it. The calculator resolves the absence
   * itself, which it has to do anyway for a literal that was never parsed.
   *
   * Brutal Critical is the reason it exists: one rule granting one die, then
   * two, then three.
   */
  dieCount: z.number().int().min(1).optional(),
  /**
   * How `dieCount` grows with level, named to match BaseModifierSchema so a
   * scaling block reads the same wherever it is authored.
   *
   * With `class_level_thresholds`, `dieCount` is ignored and the resolved
   * threshold wins - including resolving to zero below the first threshold,
   * which is how a rule that has not come online yet contributes nothing.
   */
  scalingFactor: ModifierScalingSchema.optional(),
  scalingClassId: z.string().optional(),
  scalingThresholds: z.array(ModifierScalingThresholdSchema).min(1).optional(),
  damageType: DamageTypeSchema.optional(),
  requiredAttackTypes: z.array(AttackTypeSchema).default([]),
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
});

export type CriticalHitModifier = z.infer<typeof CriticalHitModifierSchema>;
export type DiceRule = z.infer<typeof DiceRuleSchema>;
