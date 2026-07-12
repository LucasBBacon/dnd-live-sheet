import z from "zod";

export const WeaponCategorySchema = z.enum([
  "simple_melee",
  "martial_melee",
  "simple_ranged",
  "martial_ranged",
]);

export const WeaponPropertySchema = z.enum([
  "finesse",
  "thrown",
  "heavy",
  "light",
  "two_handed",
  "versatile",
  "reach",
  "ammunition",
  "loading",
  "special",
]);

export const WeaponDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: WeaponCategorySchema,
    damageDice: z.string(),
    damageType: z.string(),
    properties: z.array(WeaponPropertySchema),
    ammoItemId: z.string().optional(),
  })
  .strict();

export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;
export type WeaponDefinition = z.infer<typeof WeaponDefinitionSchema>;