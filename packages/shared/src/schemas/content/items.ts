import z from "zod";

// #region Item Schemas

/**
 * Which armour table a suit of armour belongs to.
 *
 * Declared, never inferred. "Heavy" is not the same fact as "ignores
 * Dexterity": `maxDexCap: 0` is a *consequence* of the category, so reading it
 * backwards misclassifies any armour whose AC modifiers are not yet authored.
 * Rules that gate on the category — Fast Movement, armour proficiency — need
 * the fact itself.
 *
 * Shields are absent on purpose. A shield is not body armour, and the rules
 * that care about shields ask a different question ("are you wielding one")
 * answered from a different slot.
 */
export const ArmorCategorySchema = z.enum(["light", "medium", "heavy"]);

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

// #endregion

// #region Type Exports

export type ArmorCategory = z.infer<typeof ArmorCategorySchema>;
export type EquipSlot = z.infer<typeof EquipSlotSchema>;
export type ContainerCapacity = z.infer<typeof ContainerCapacitySchema>;
export type StartingEquipmentCategoryTag = z.infer<
  typeof StartingEquipmentCategoryTagSchema
>;
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

// #endregion
