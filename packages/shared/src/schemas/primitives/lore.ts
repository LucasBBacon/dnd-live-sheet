import { z } from "zod";

/** Canonical authored-text shape shared by every entity that carries lore. */
export const LoreSchema = z
  .object({
    shortDescription: z.string().min(1).max(280),
    fullText: z.string().max(8000).optional(),
  })
  .strict();

export type Lore = z.infer<typeof LoreSchema>;
