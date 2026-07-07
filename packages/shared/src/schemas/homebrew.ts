import { z } from "zod";
import { TraitEffectSchema } from "./effects.js";

const HomebrewIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

const HomebrewLoreSchema = z.object({
  shortDescription: z.string().min(1).max(280),
  fullText: z.string().max(8000).optional(),
});

export const HomebrewContextSchema = z.object({
  campaignId: z.uuid(),
  ownerCharacterId: z.uuid().optional(),
  supersedesId: z.string().min(1).max(100).optional(),
});

export const CreateHomebrewTraitSchema = HomebrewContextSchema.extend({
  id: HomebrewIdSchema,
  name: z.string().min(1).max(255),
  lore: HomebrewLoreSchema,
  effects: z.array(TraitEffectSchema),
  isStartingProficiency: z.boolean().optional(),
});

export const UpdateHomebrewTraitSchema = HomebrewContextSchema.extend({
  name: z.string().min(1).max(255).optional(),
  lore: HomebrewLoreSchema.optional(),
  effects: z.array(TraitEffectSchema).optional(),
  isStartingProficiency: z.boolean().optional(),
});

export const CreateHomebrewItemSchema = HomebrewContextSchema.extend({
  id: HomebrewIdSchema,
  name: z.string().min(1).max(255),
  weight: z.number().int().min(0).max(100_000),
  description: z.string().min(1).max(8000),
  isBundle: z.boolean().optional(),
});

export const UpdateHomebrewItemSchema = HomebrewContextSchema.extend({
  name: z.string().min(1).max(255).optional(),
  weight: z.number().int().min(0).max(100_000).optional(),
  description: z.string().min(1).max(8000).optional(),
  isBundle: z.boolean().optional(),
});

export const HomebrewLifecycleActionSchema = z.object({
  campaignId: z.uuid(),
});

export type CreateHomebrewTraitPayload = z.infer<
  typeof CreateHomebrewTraitSchema
>;
export type UpdateHomebrewTraitPayload = z.infer<
  typeof UpdateHomebrewTraitSchema
>;
export type CreateHomebrewItemPayload = z.infer<
  typeof CreateHomebrewItemSchema
>;
export type UpdateHomebrewItemPayload = z.infer<
  typeof UpdateHomebrewItemSchema
>;
