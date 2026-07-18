import z from "zod";

export const DamageTypeSchema = z.enum([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

export const AffinityLevelSchema = z.enum([
  "vulnerability",
  "resistance",
  "immunity",
]);

export const FixedAffinityGrantSchema = z.object({
  damageType: DamageTypeSchema,
  level: AffinityLevelSchema.default("resistance"),
});

export const ChoiceAffinityGrantSchema = z.object({
  id: z.string(),
  chooseAmount: z.number().min(1).default(1),
  options: z.array(DamageTypeSchema).optional(),
  level: AffinityLevelSchema.default("resistance"),
});

export type DamageType = z.infer<typeof DamageTypeSchema>;
export type AffinityLevel = z.infer<typeof AffinityLevelSchema>;
export type FixedAffinityGrant = z.infer<typeof FixedAffinityGrantSchema>;
