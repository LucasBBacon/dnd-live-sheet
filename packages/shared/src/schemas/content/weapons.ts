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
  "range",
]);

export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;
