import z from "zod";
import { EquipmentDefinitionSchema } from "./equipment.js";
import { ItemDefinitionSchema } from "./items.js";
import { BaseModifierSchema } from "./modifiers.js";
import { ResourceThresholdSchema } from "./primitives/scaling.js";
import { ResourceSchema } from "./resources.js";
import {
  WeaponCategorySchema,
  WeaponDefinitionSchema,
  WeaponPropertySchema,
} from "./weapons.js";

// #region Weapon Rules
export {
  WeaponCategorySchema,
  WeaponPropertySchema,
  WeaponDefinitionSchema,
} from "./weapons.js";

// #endregion

// #region Resource Rules

export const TraitDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    modifiers: z.array(BaseModifierSchema),
  })
  .strict();

export const RuleSnapshotSchema = z
  .object({
    // canonical equipment field - single source over time
    equipmentById: z.record(z.string(), EquipmentDefinitionSchema).optional(),
    // compatibility fields - kept for phased consumer migration
    itemsById: z.record(z.string(), ItemDefinitionSchema),
    resourcesById: z.record(z.string(), ResourceSchema),
    traitsById: z.record(z.string(), TraitDefinitionSchema),
    weaponsById: z.record(z.string(), WeaponDefinitionSchema),
  })
  .strict();

// #endregion

// #region Type Exports

export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;
export type WeaponDefinition = z.infer<typeof WeaponDefinitionSchema>;
export type ResourceThreshold = z.infer<typeof ResourceThresholdSchema>;
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>;
export type RuleSnapshot = z.infer<typeof RuleSnapshotSchema>;

// #endregion
