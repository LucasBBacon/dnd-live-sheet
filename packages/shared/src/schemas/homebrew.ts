import { z } from "zod";
import { TraitEffectSchema } from "./effects.js";

// #region Homebrew Schemas

const HomebrewIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase snake_case ids.");

const HomebrewLoreSchema = z.object({
  shortDescription: z.string().min(1).max(280),
  fullText: z.string().max(8000).optional(),
});

/**
 * Schema for the context of a homebrew entity, including campaign and character information.
 */
export const HomebrewContextSchema = z.object({
  campaignId: z.uuid(),
  ownerCharacterId: z.uuid().optional(), // The ID of the character that owns this homebrew entity, if applicable.
  supersedesId: z.string().min(1).max(100).optional(), // The ID of the homebrew entity that this one supersedes, if applicable.
});

/**
 * Schema for creating a new homebrew trait, including its ID, name, lore, effects, and optional starting proficiency flag.
 */
export const CreateHomebrewTraitSchema = HomebrewContextSchema.extend({
  id: HomebrewIdSchema,
  name: z.string().min(1).max(255),
  lore: HomebrewLoreSchema,
  effects: z.array(TraitEffectSchema),
  isStartingProficiency: z.boolean().optional(),
});

/**
 * Schema for updating an existing homebrew trait, allowing optional updates to its name, lore, effects, and starting proficiency flag.
 */
export const UpdateHomebrewTraitSchema = HomebrewContextSchema.extend({
  name: z.string().min(1).max(255).optional(),
  lore: HomebrewLoreSchema.optional(),
  effects: z.array(TraitEffectSchema).optional(),
  isStartingProficiency: z.boolean().optional(),
});

/**
 * Schema for creating a new homebrew item, including its ID, name, weight, description, and optional bundle flag.
 */
export const CreateHomebrewItemSchema = HomebrewContextSchema.extend({
  id: HomebrewIdSchema,
  name: z.string().min(1).max(255),
  weight: z.number().int().min(0).max(100_000),
  description: z.string().min(1).max(8000),
  isBundle: z.boolean().optional(),
});

/**
 * Schema for updating an existing homebrew item, allowing optional updates to its name, weight, description, and bundle flag.
 */
export const UpdateHomebrewItemSchema = HomebrewContextSchema.extend({
  name: z.string().min(1).max(255).optional(),
  weight: z.number().int().min(0).max(100_000).optional(),
  description: z.string().min(1).max(8000).optional(),
  isBundle: z.boolean().optional(),
});

/**
 * Schema for actions related to the lifecycle of homebrew entities, such as publishing or archiving, requiring a valid campaign ID.
 */
export const HomebrewLifecycleActionSchema = z.object({
  campaignId: z.uuid(),
});

// #endregion

// #region Type Exports

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

// #endregion
