import z from "zod";
import { BaseModifierSchema } from "./modifiers.js";

export const TraitProficiencyCategorySchema = z.enum([
  "armor",
  "weapons",
  "tools",
  "saving_throws",
  "skills",
  "languages",
  "ability_check",
]);

export const ProficiencyLevelSchema = z.enum([
  "half",
  "proficient",
  "expertise",
]);

export const FixedProficiencyGrantSchema = z.object({
  category: TraitProficiencyCategorySchema,
  proficiencyId: z.string(),
  level: ProficiencyLevelSchema.default("proficient"),
});

export const ChoiceProficiencyGrantSchema = z.object({
  id: z.string(), // unique id of this specific choice block
  category: TraitProficiencyCategorySchema,
  chooseAmount: z.number().min(1).default(1),
  // if undefined, implies ANY from the category. If array, restrict choices from these ids
  options: z.array(z.string()).optional(),
  level: ProficiencyLevelSchema.default("proficient"),
});

export const TraitDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  modifiers: z.array(BaseModifierSchema).default([]),
  proficiencies: z
    .object({
      fixed: z.array(FixedProficiencyGrantSchema).default([]),
      choices: z.array(ChoiceProficiencyGrantSchema).default([]),
    })
    .optional(),
});

export type TraitProficiencyCategory = z.infer<
  typeof TraitProficiencyCategorySchema
>;
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;
export type FixedProficiencyGrant = z.infer<typeof FixedProficiencyGrantSchema>;
export type ChoiceProficiencyGrant = z.infer<
  typeof ChoiceProficiencyGrantSchema
>;
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>;

export const ResolvedTraitChoiceSchema = z.object({
  traitId: z.string(),
  choiceId: z.string(), // maps to ChoiceProficiencyGrantSchema.id
  selectedProficiencyIds: z.array(z.string()),
});

export type ResolvedTraitChoice = z.infer<typeof ResolvedTraitChoiceSchema>;
