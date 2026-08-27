import { z } from "zod";

/**
 * A weapon damage expression: dice, or a flat amount.
 *
 * `1d8`, `2d6+1` and a bare `1` are all damage someone meant to deal. A
 * blowgun and an unarmed strike deal exactly 1 with no die to roll, and a net
 * deals none at all - which is spelled by omitting the field, not by an empty
 * string. Before this, `damageDice` was a bare `z.string()`, so `""` validated
 * happily and then threw inside DiceEngine.
 *
 * Stricter than `DiceEngine.parse`, which strips whitespace: authored data is
 * normalized, and every entry in the shipped pack is already unspaced.
 */
export const DamageExpressionSchema = z
  .string()
  .regex(
    /^(\d+d\d+([+-]\d+)?|\d+)$/,
    "must be dice (1d8, 2d6+1) or a flat amount (1)",
  );

export type DamageExpression = z.infer<typeof DamageExpressionSchema>;
