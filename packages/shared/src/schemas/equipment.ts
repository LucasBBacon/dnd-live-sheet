import { z } from "zod";
import { BaseModifierSchema } from "./modifiers.js";
import { ContainerCapacitySchema, EquipSlotSchema } from "./items.js";
import { WeaponCategorySchema, WeaponPropertySchema } from "./weapons.js";
import { DamageTypeSchema } from "./affinities.js";

export const EquipmentTypeSchema = z.enum([
  "armor",
  "weapon",
  "consumable",
  "gear",
  "wondrous", // rings, cloaks, ioun stones: worn, but not armor
]);

export const WeaponCapabilitySchema = z
  .object({
    category: WeaponCategorySchema,
    damageDice: z.string(),
    // the two-handed die for a versatile weapon. WeaponDefinition has always
    // had this; without it here, EquipmentDefinition cannot carry a versatile
    // weapon and the projection back out silently downgrades it
    versatileDamageDice: z.string().optional(),
    damageType: DamageTypeSchema,
    properties: z.array(WeaponPropertySchema),
    range: z.number().default(5),
    longRange: z.number().optional(),
    ammoItemId: z.string().optional(),
    ammoTag: z.string().optional(),
  })
  .strict();

export const EquipmentDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: EquipmentTypeSchema.default("gear"),
    // inventory mechanics, mirroring ItemDefinitionSchema: this is the authored
    // source ItemDefinition is projected from, so the fields have to live here
    // or they can never be authored
    weight: z.number().default(0),
    equipSlot: EquipSlotSchema.optional(),
    requiresAttunement: z.boolean().default(false),
    ammoTag: z.string().optional(),
    container: ContainerCapacitySchema.optional(),
    modifiers: z.array(BaseModifierSchema).optional(),
    weapon: WeaponCapabilitySchema.optional(),
  })
  .strict();

export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type WeaponCapability = z.infer<typeof WeaponCapabilitySchema>;
export type EquipmentDefinition = z.infer<typeof EquipmentDefinitionSchema>;
