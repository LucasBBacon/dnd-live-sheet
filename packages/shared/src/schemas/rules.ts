import z from "zod";
import { EquipmentDefinitionSchema } from "./equipment.js";
import { ItemDefinitionSchema } from "./items.js";
import { BaseModifierSchema } from "./modifiers.js";
import {
  WeaponDefinitionSchema,
  type WeaponCategory,
  type WeaponDefinition,
  type WeaponProperty,
} from "./weapons.js";

// #region Weapon Rules
export {
  WeaponCategorySchema,
  WeaponPropertySchema,
  WeaponDefinitionSchema,
} from "./weapons.js";

// #endregion

// #region Resource Rules

export const RestConditionSchema = z.enum([
  "short_rest",
  "long_rest",
  "long_rest_half",
  "dawn",
  "never",
]);

export const ResourceThresholdSchema = z
  .object({
    minimumLevel: z.number().int().nonnegative(),
    value: z.number().int().nonnegative(),
  })
  .strict();

export const ResourceMaxRuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fixed"),
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("total_level_thresholds"),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("class_level_thresholds"),
      classId: z.string(),
      thresholds: z.array(ResourceThresholdSchema).min(1),
    })
    .strict(),
]);

export const ResourceRuleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    resetCondition: RestConditionSchema,
    maxRule: ResourceMaxRuleSchema,
  })
  .strict();

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
    resourcesById: z.record(z.string(), ResourceRuleSchema),
    traitsById: z.record(z.string(), TraitDefinitionSchema),
    weaponsById: z.record(z.string(), WeaponDefinitionSchema),
  })
  .strict();

// #endregion

// #region Type Exports

export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
export type WeaponProperty = z.infer<typeof WeaponPropertySchema>;
export type WeaponDefinition = z.infer<typeof WeaponDefinitionSchema>;
export type RestCondition = z.infer<typeof RestConditionSchema>;
export type ResourceThreshold = z.infer<typeof ResourceThresholdSchema>;
export type ResourceMaxRule = z.infer<typeof ResourceMaxRuleSchema>;
export type ResourceRule = z.infer<typeof ResourceRuleSchema>;
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>;
export type RuleSnapshot = z.infer<typeof RuleSnapshotSchema>;

// #endregion
