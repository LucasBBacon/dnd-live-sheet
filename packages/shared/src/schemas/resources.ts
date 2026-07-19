import z from "zod";

export const ResourceResetSchema = z.enum([
  "short_rest",
  "long_rest",
  "dawn",
  "initiative_roll",
  "start_of_turn",
]);

export const ResourceGrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxCharges: z.number().default(1),
  resetOn: ResourceResetSchema,
});

export type ResourceReset = z.infer<typeof ResourceResetSchema>;
export type ResourceGrant = z.infer<typeof ResourceGrantSchema>;
