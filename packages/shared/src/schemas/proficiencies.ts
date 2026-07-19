import z from "zod";

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
  requiredStates: z.array(z.string()).default([]),
});

export const ChoiceProficiencyGrantSchema = z.object({
  id: z.string(), // unique id of this specific choice block
  category: TraitProficiencyCategorySchema,
  chooseAmount: z.number().min(1).default(1),
  // if undefined, implies ANY from the category. If array, restrict choices from these ids
  options: z.array(z.string()).optional(),
  level: ProficiencyLevelSchema.default("proficient"),
  requiredStates: z.array(z.string()).default([]),
});

export type TraitProficiencyCategory = z.infer<
  typeof TraitProficiencyCategorySchema
>;
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;
export type FixedProficiencyGrant = z.infer<typeof FixedProficiencyGrantSchema>;
export type ChoiceProficiencyGrant = z.infer<
  typeof ChoiceProficiencyGrantSchema
>;
