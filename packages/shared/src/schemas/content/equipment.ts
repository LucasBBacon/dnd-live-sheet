import { z } from "zod";
import { BaseModifierSchema } from "./modifiers.js";
import {
  ArmorCategorySchema,
  ContainerCapacitySchema,
  EquipSlotSchema,
  ItemRequirementSchema,
  StartingEquipmentCategoryTagSchema,
} from "./items.js";
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
    // the two-handed die for a versatile weapon. Without it here,
    // EquipmentDefinition cannot carry a versatile weapon and the engine's
    // weapon view silently downgrades it
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
    // inventory mechanics: EquipmentDefinition is the single authored item
    // shape, so every field the inventory and encumbrance code reads has to
    // live here or it can never be authored
    weight: z.number().default(0),
    armorCategory: ArmorCategorySchema.optional(),
    equipSlot: EquipSlotSchema.optional(),
    requiresAttunement: z.boolean().default(false),
    requirements: z.array(ItemRequirementSchema).optional(),
    ammoTag: z.string().optional(),
    container: ContainerCapacitySchema.optional(),
    categoryTags: z.array(StartingEquipmentCategoryTagSchema).default([]),
    modifiers: z.array(BaseModifierSchema).optional(),
    weapon: WeaponCapabilitySchema.optional(),
  })
  .strict();

export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type WeaponCapability = z.infer<typeof WeaponCapabilitySchema>;
export type EquipmentDefinition = z.infer<typeof EquipmentDefinitionSchema>;
