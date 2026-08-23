import { z } from "zod";

/**
 * The gate almost every rule carries: states that must hold, states that must
 * not.
 *
 * Declared inline at roughly ten sites before this existed. Both default to
 * empty, so an ungated rule authors nothing.
 */
export const StatePredicateSchema = z.object({
  requiredStates: z.array(z.string()).default([]),
  forbiddenStates: z.array(z.string()).default([]),
});

export type StatePredicate = z.infer<typeof StatePredicateSchema>;
