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
import { DamageExpressionSchema } from "../primitives/damageExpression.js";

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
    // absent means the weapon deals no damage. A net rolls to hit and deals
    // nothing; it used to say so with `""`, which no layer could catch.
    damageDice: DamageExpressionSchema.optional(),
    // the two-handed die for a versatile weapon. Without it here,
    // EquipmentDefinition cannot carry a versatile weapon and the engine's
    // weapon view silently downgrades it
    versatileDamageDice: DamageExpressionSchema.optional(),
    damageType: DamageTypeSchema.optional(),
    properties: z.array(WeaponPropertySchema),
    range: z.number().default(5),
    longRange: z.number().optional(),
    ammoItemId: z.string().optional(),
    ammoTag: z.string().optional(),
    /**
     * A rule this engine cannot enforce, in words the table can act on.
     *
     * The net restrains its target and the lance is at disadvantage within
     * five feet; neither is representable here, because hostiles exist only as
     * a `targetLabel` string and `apply_effect` writes to the character's own
     * EffectManager. Reporting it is what this codebase already does with
     * surprise and with Disengage, Help and Ready.
     */
    specialNote: z.string().min(1).optional(),
  })
  .strict()
  // Both refines are Zod-only: z.toJSONSchema drops .refine() silently, so the
  // ajv pass in packSchemas.test.ts cannot see them. equipment.test.ts covers
  // them directly.
  .refine(
    (weapon) =>
      (weapon.damageDice === undefined) === (weapon.damageType === undefined),
    {
      message:
        "damageDice and damageType must be authored together, or both omitted for a weapon that deals no damage",
      path: ["damageType"],
    },
  )
  .refine(
    (weapon) =>
      weapon.versatileDamageDice === undefined ||
      weapon.damageDice !== undefined,
    {
      message: "versatileDamageDice requires a one-handed damageDice",
      path: ["versatileDamageDice"],
    },
  );

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
