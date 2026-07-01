import type { Modifier } from "../types/engine.js";

/**
 * A static compilation dictionary that acts as the rules compilation layer.
 * Maps item IDs directly to their implicit mechanical modifier rules.
 */
export const EQUIPMENT_RULES_MAP: Record<
  string,
  (instanceId: string) => Modifier[]
> = {
  item_armor_padded: (id) => [
    {
      id: `${id}_ac`,
      target: "AC",
      type: "set_base",
      value: 11,
      sourceName: "Padded Armor",
      sourceOrigin: "item",
      isActive: true,
    },
  ],

  item_armor_leather: (id) => [
    {
      id: `${id}_ac`,
      target: "AC",
      type: "set_base",
      value: 11, // leather armor sets base AC to 11 + dex
      sourceName: "Leather Armor",
      sourceOrigin: "Item",
      isActive: true,
    },
  ],

  item_armor_studded_leather: (id) => [
    {
      id: `${id}_ac`,
      target: "AC",
      type: "set_base",
      value: 12,
      sourceName: "Studded Leather Armor",
      sourceOrigin: "item",
      isActive: true,
    },
  ],

  item_armor_plate: (id) => [
    {
      id: `${id}_ac`,
      target: "AC",
      type: "set_base",
      value: 18, // plate armor sets base AC to a flat 18
      sourceName: "Plate Armor",
      sourceOrigin: "Item",
      isActive: true,
    },
    {
      id: `${id}_stealth_dis`,
      target: "STEALTH_CHECK",
      type: "disadvantage",
      value: 0,
      sourceName: "Plate Armor (Heavy)",
      sourceOrigin: "Item",
      isActive: true,
    },
  ],

  item_shield: (id) => [
    {
      id: `${id}_shield_ac`,
      target: "AC",
      type: "add",
      value: 2, // shield adds a flat + 2 to AC
      sourceName: "Shield",
      sourceOrigin: "Item",
      isActive: true,
    },
  ],

  item_ring_of_protection: (id) => [
    {
      id: `${id}_rop_ac`,
      target: "AC",
      type: "add",
      value: 1,
      sourceName: "Ring of Protection",
      sourceOrigin: "Item",
      isActive: true, // this will be conditioned on the 'isAttuned' flag during compilation
    },
    {
      id: `${id}_rop_saves`,
      target: "ALL_SAVES",
      type: "add",
      value: 1,
      sourceName: "Ring of Protection",
      sourceOrigin: "Item",
      isActive: true,
    },
  ],
};
