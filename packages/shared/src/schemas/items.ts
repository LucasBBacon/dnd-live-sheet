import z from "zod";
import { BaseModifierSchema } from "./modifiers.js";

// #region Item Schemas

export const ItemTypeSchema = z.enum(["armor", "weapon", "consumable", "gear"]);

export const ItemDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ItemTypeSchema.default("gear"),
  modifiers: z.array(BaseModifierSchema).optional(),
});

// #endregion

// #region Type Exports

export type ItemType = z.infer<typeof ItemTypeSchema>;
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;

// #endregion
