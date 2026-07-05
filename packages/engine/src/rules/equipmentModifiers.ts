import type { ItemDefinition, RuntimeModifier } from "@project/shared";

/**
 * A static compilation dictionary that acts as the rules compilation layer.
 * Maps item IDs directly to their implicit mechanical modifier rules.
 */
export const ITEM_DICTIONARY: Record<string, ItemDefinition> = {
  item_armor_padded: {
    id: "item_armor_padded",
    name: "Padded Armor",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11,
        scalingFactor: "none",
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
      },
    ],
  },

  item_armor_leather: {
    id: "item_armor_leather",
    name: "Leather Armor",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11, // leather armor sets base ARMOR_CLASS to 11 + dex
        scalingFactor: "none",
      },
    ],
  },

  item_armor_studded_leather: {
    id: "item_armor_studded_leather",
    name: "Studded Leather Armor",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 12,
        scalingFactor: "none",
      },
    ],
  },

  item_armor_plate: {
    id: "item_armor_plate",
    name: "Plate Armor",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 18, // plate armor sets base ARMOR_CLASS to a flat 18
        scalingFactor: "none",
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
      },
    ],
  },

  item_shield: {
    id: "item_shield",
    name: "Shield",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 2, // shield adds a flat + 2 to ARMOR_CLASS
        scalingFactor: "none",
      },
    ],
  },

  item_ring_of_protection: {
    id: "item_ring_of_protection",
    name: "Ring of Protection",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
      {
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        scalingFactor: "none",
      },
    ],
  },
};
