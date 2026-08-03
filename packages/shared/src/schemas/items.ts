import z from "zod";
import { BaseModifierSchema } from "./modifiers.js";

// #region Item Schemas

export const ItemTypeSchema = z.enum([
  "armor",
  "weapon",
  "consumable",
  "gear",
  "tool",
  "loot",
  "wondrous", // rings, cloaks, ioun stones: worn, but not armor
]);

/**
 * The kind of slot an item occupies — a property of the *definition*.
 * A ring goes in "a ring slot"; it has no opinion about which finger.
 */
export const EquipSlotSchema = z.enum([
  "head",
  "amulet",
  "cloak",
  "body", // worn armor
  "main_hand",
  "off_hand",
  "gloves",
  "ring",
  "boots",
]);

/**
 * A concrete slot on a *character*, which is where capacity lives: one body,
 * but two ring fingers. "backpack" is the null slot — carried, not worn.
 */
export const CharacterSlotSchema = z.enum([
  "backpack",
  "head",
  "amulet",
  "cloak",
  "body",
  "main_hand",
  "off_hand",
  "gloves",
  "ring_1",
  "ring_2",
  "boots",
]);

export const ItemDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ItemTypeSchema.default("gear"),
  weight: z.number().default(0),
  // equipment mechanics
  equipSlot: EquipSlotSchema.optional(),
  requiresAttunement: z.boolean().default(false),
  modifiers: z.array(BaseModifierSchema).optional(),
});

/**
 * One stack of one item in a character's possession.
 *
 * Field names match the characterInventory table and the socket payloads, so
 * this single type serves the store, the wire and the engine with no adapter.
 */
export const InventoryInstanceSchema = z.object({
  id: z.string(), // unique id for this specific stack in the bag
  itemId: z.string(), // points to static dict (e.g., 'item_longsword')

  quantity: z.number().int().min(1).default(1),

  // live state
  // where the item is worn. "backpack" means carried, so this single field
  // replaces isEquipped: a boolean cannot say ring_1 vs ring_2
  slot: CharacterSlotSchema.default("backpack"),
  isAttuned: z.boolean().default(false),

  // allows for renamed items
  customName: z.string().optional(),
});

// #endregion

// #region Type Exports

export type ItemType = z.infer<typeof ItemTypeSchema>;
export type EquipSlot = z.infer<typeof EquipSlotSchema>;
export type CharacterSlot = z.infer<typeof CharacterSlotSchema>;
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;
export type InventoryInstance = z.infer<typeof InventoryInstanceSchema>;

// #endregion
