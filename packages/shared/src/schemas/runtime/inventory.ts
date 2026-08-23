import z from "zod";

// #region Inventory Schemas

/**
 * A concrete slot on a *character*, which is where capacity lives: one body,
 * but two ring fingers. "backpack" is the null slot — carried, not worn.
 *
 * Runtime rather than content: it names a place on a live character, not a
 * property an authored EquipmentDefinition declares. EquipSlotSchema (the
 * definition's slot *kind*) stays in content/items.js for that reason.
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
  /**
   * The inventory row id of the container this stack is inside, when it is.
   *
   * Optional because most rows are loose in the pack, and because nothing
   * persists it yet: character_inventory keys on (characterId, itemId), so two
   * stacks of the same item cannot exist and real containment needs a
   * migration. ContainerEngine is built and tested against this field so the
   * rule is settled before the storage change lands.
   */
  containerId: z.string().optional(),
  isAttuned: z.boolean().default(false),

  // allows for renamed items
  customName: z.string().optional(),
});

// #endregion

// #region Type Exports

export type CharacterSlot = z.infer<typeof CharacterSlotSchema>;
export type InventoryInstance = z.infer<typeof InventoryInstanceSchema>;

// #endregion
