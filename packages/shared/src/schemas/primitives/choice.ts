import { z } from "zod";
import { CoreRuleIdSchema } from "./ids.js";

/**
 * "Choose N of these."
 *
 * Six variants existed with three names for the count (chooseAmount, pickCount,
 * choose) and two for identity (id, nodeId). This settles on `id` and
 * `pickCount`; the existing field names stay on their own schemas until a
 * consumer migration, so this is the shape new blocks are built from.
 * @param optionSchema What one option looks like
 * @returns A choice block over that option type
 */
export const choiceOf = <T extends z.ZodTypeAny>(optionSchema: T) =>
  z.object({
    id: CoreRuleIdSchema,
    pickCount: z.number().int().min(1).default(1),
    options: z.array(optionSchema),
  });
