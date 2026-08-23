import z from "zod";
import { EquipmentDefinitionSchema } from "./equipment.js";
import { ItemDefinitionSchema } from "./items.js";
import { ResourceSchema } from "./resources.js";
import { TraitDefinitionSchema } from "./traits.js";
import { WeaponDefinitionSchema } from "./weapons.js";

// #region Resource Rules

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

export type RuleSnapshot = z.infer<typeof RuleSnapshotSchema>;

// #endregion
