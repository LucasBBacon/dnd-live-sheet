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

/**
 * How much a container holds.
 *
 * Pounds only. The PHB gives a backpack "1 cubic foot / 30 pounds of gear",
 * a barrel "40 gallons", and a quiver "20 arrows" - three different axes, of
 * which only the first is a weight limit. Volume and item count need their own
 * data and their own rules, so they are absent rather than approximated.
 */
export const ContainerCapacitySchema = z
  .object({
    capacityPounds: z.number(),
  })
  .strict();

// explicit category vocabulary for starting-equipment category resolution
export const StartingEquipmentCategoryTagSchema = z.enum([
  "category_weapon_simple",
  "category_weapon_simple_melee",
  "category_weapon_simple_ranged",
  "category_weapon_martial",
  "category_weapon_martial_melee",
  "category_weapon_martial_ranged",
  "category_armor_shield",
  "category_holy_symbol",
  "category_arcane_focus",
  "category_druidic_focus",
  "category_musical_instrument",
]);

export const ItemDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ItemTypeSchema.default("gear"),
  weight: z.number().default(0),
  // equipment mechanics
  equipSlot: EquipSlotSchema.optional(),
  requiresAttunement: z.boolean().default(false),
  // marks this item as ammunition of a kind, e.g. "arrow". A weapon firing the
  // same tag can consume it, so magical variants need no special casing
  ammoTag: z.string().optional(),
  // present only on items that hold other items
  container: ContainerCapacitySchema.optional(),
  // category membership for deterministic starting-equipment category matching
  categoryTags: z.array(StartingEquipmentCategoryTagSchema).default([]),
  modifiers: z.array(BaseModifierSchema).optional(),
});

export const StartingEquipmentGrantSchema = z
  .object({
    kind: z.enum(["item", "category", "money"]),
    refId: z.string(),
    quantity: z.number().int().min(1).default(1),
  })
  .strict();

export const StartingEquipmentChoiceOptionSchema = z
  .object({
    equipmentBundle: z.array(StartingEquipmentGrantSchema).default([]),
  })
  .strict();

export const StartingEquipmentChoiceSchema = z
  .object({
    choose: z.number().int().min(1).default(1),
    options: z.array(StartingEquipmentChoiceOptionSchema).default([]),
  })
  .strict();

export const StartingEquipmentDefinitionSchema = z
  .object({
    given: z.array(StartingEquipmentGrantSchema).default([]),
    choices: z.array(StartingEquipmentChoiceSchema).default([]),
  })
  .strict();

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

export type ItemType = z.infer<typeof ItemTypeSchema>;
export type EquipSlot = z.infer<typeof EquipSlotSchema>;
export type CharacterSlot = z.infer<typeof CharacterSlotSchema>;
export type ContainerCapacity = z.infer<typeof ContainerCapacitySchema>;
export type StartingEquipmentCategoryTag = z.infer<
  typeof StartingEquipmentCategoryTagSchema
>;
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;
export type StartingEquipmentGrant = z.infer<
  typeof StartingEquipmentGrantSchema
>;
export type StartingEquipmentChoiceOption = z.infer<
  typeof StartingEquipmentChoiceOptionSchema
>;
export type StartingEquipmentChoice = z.infer<
  typeof StartingEquipmentChoiceSchema
>;
export type StartingEquipmentDefinition = z.infer<
  typeof StartingEquipmentDefinitionSchema
>;
export type InventoryInstance = z.infer<typeof InventoryInstanceSchema>;

// #endregion
