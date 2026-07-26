import z from "zod";
import { ActionGrantSchema } from "./actions.js";

export const SpellSchoolSchema = z.enum([
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
]);

export const SpellComponentSchema = z.object({
  verbal: z.boolean().default(false),
  somatic: z.boolean().default(false),
  material: z.boolean().default(false),
  materialDescription: z.string().optional(),
  goldCost: z.number().default(0),
  isConsumed: z.boolean().default(false),
});

export const SpellDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().min(0).max(9), // 0 = cantrip
  school: SpellSchoolSchema,
  isRitual: z.boolean().default(false),
  // a spell fundamentally grants an  action to the character
  action: ActionGrantSchema,
});

export type SpellDefinition = z.infer<typeof SpellDefinitionSchema>;
