import { z } from "zod";

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** Uppercase, as modifier targets and AC formulas spell it. */
export const AbilitySchema = z.enum(ABILITIES);

/** Lowercase, as saves, prerequisites and payloads spell it. */
export const AbilityKeySchema = z.enum(ABILITY_KEYS);

/**
 * A full set of six scores, bounded per call site.
 *
 * The bounds are not a property of an ability: a stored score runs 1-30, a
 * rolled score at character creation runs 3-18. Both were inlined separately,
 * which is how the six keys came to be written out four times.
 * @param min Lowest legal score
 * @param max Highest legal score
 * @returns A strict object of all six abilities
 */
export const abilityScoresOf = (min: number, max: number) =>
  z
    .object(
      Object.fromEntries(
        ABILITY_KEYS.map((key) => [key, z.number().int().min(min).max(max)]),
      ) as Record<(typeof ABILITY_KEYS)[number], z.ZodNumber>,
    )
    .strict();

/** Every ability optional, for prerequisites that gate on a subset. */
export const AbilityMinimumsSchema = z.object(
  Object.fromEntries(
    ABILITY_KEYS.map((key) => [
      key,
      z.number().int().min(1).max(30).optional(),
    ]),
  ) as Record<(typeof ABILITY_KEYS)[number], z.ZodOptional<z.ZodNumber>>,
);

export type Ability = z.infer<typeof AbilitySchema>;
export type AbilityKey = z.infer<typeof AbilityKeySchema>;
export type AbilityMinimums = z.infer<typeof AbilityMinimumsSchema>;
