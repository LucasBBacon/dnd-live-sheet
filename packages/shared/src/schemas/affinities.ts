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
  "same_as_weapon"
]);

export const AffinityLevelSchema = z.enum([
  "vulnerability",
  "resistance",
  "immunity",
]);

export const DamageBypassSchema = z.enum([
  "magical",
  "silvered",
  "adamantine",
  "spell",
]);

export const FixedAffinityGrantSchema = z.object({
  damageType: DamageTypeSchema,
  level: AffinityLevelSchema.default("resistance"),
  // evaluated on impact: if the incoming damage source has any of these tags, the affinity is ignored
  bypassedBy: z.array(DamageBypassSchema).default([]),
  // evaluated on state change: the affinity is only active if the character has all these tags in their active status pool
  requiredStates: z.array(z.string()).default([]),
});

export const ChoiceAffinityGrantSchema = z.object({
  id: z.string(),
  chooseAmount: z.number().min(1).default(1),
  options: z.array(DamageTypeSchema).optional(),
  level: AffinityLevelSchema.default("resistance"),
  bypassedBy: z.array(DamageBypassSchema).default([]),
  requiredStates: z.array(z.string()).default([]),
});

export type DamageType = z.infer<typeof DamageTypeSchema>;
export type AffinityLevel = z.infer<typeof AffinityLevelSchema>;
export type DamageBypass = z.infer<typeof DamageBypassSchema>;
export type FixedAffinityGrant = z.infer<typeof FixedAffinityGrantSchema>;
