import { z } from "zod";
import { BaseModifierSchema } from "./modifiers.js";
import {
  WeaponCategorySchema,
  WeaponPropertySchema,
} from "./weapons.js";

export const EquipmentTypeSchema = z.enum([
  "armor",
  "weapon",
  "consumable",
  "gear",
]);

export const WeaponCapabilitySchema = z
  .object({
    category: WeaponCategorySchema,
    damageDice: z.string(),
    damageType: z.string(),
    properties: z.array(WeaponPropertySchema),
    ammoItemId: z.string().optional(),
  })
  .strict();

export const EquipmentDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: EquipmentTypeSchema.default("gear"),
    modifiers: z.array(BaseModifierSchema).optional(),
    weapon: WeaponCapabilitySchema.optional(),
  })
  .strict();

export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type WeaponCapability = z.infer<typeof WeaponCapabilitySchema>;
export type EquipmentDefinition = z.infer<typeof EquipmentDefinitionSchema>;