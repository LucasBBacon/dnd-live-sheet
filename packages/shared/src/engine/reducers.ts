import { z } from "zod";
import type { ModifierSchema } from "../schemas/character.js";

type Modifier = z.infer<typeof ModifierSchema>;

/**
 * Filters and sums all modifiers of a specific type targeting a specific attribute.
 * @param modifiers The list of modifiers to filter and sum.
 * @param target The target attribute to filter by.
 * @param type The type of modifier to filter by ("bonus" or "penalty").
 * @returns The sum of the filtered modifiers' values.
 */
export const sumModifiers = (
  modifiers: Modifier[],
  target: string,
  type: "bonus" | "penalty" = "bonus",
): number => {
  return modifiers
    .filter((mod) => mod.target === target && mod.type === type)
    .reduce((total, mod) => total + (mod.value ?? 0), 0);
};
