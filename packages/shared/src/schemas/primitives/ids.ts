import { z } from "zod";

/**
 * The id format every authored entity uses.
 *
 * Copied verbatim in coreRulePack.ts, importPack.ts and homebrew.ts before this
 * existed, which is three places for one rule to drift.
 */
export const CoreRuleIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

export type CoreRuleId = z.infer<typeof CoreRuleIdSchema>;
