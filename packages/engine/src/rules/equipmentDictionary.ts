import type {
  EquipmentDefinition,
  ItemDefinition,
  StartingEquipmentCategoryTag,
  WeaponDefinition,
} from "@project/shared";
import { EquipmentDefinitionSchema } from "@project/shared";

type EquipmentDefinitionSeed = Omit<EquipmentDefinition, "categoryTags"> & {
  categoryTags?: StartingEquipmentCategoryTag[];
};

const SIMPLE_MELEE_TAGS: StartingEquipmentCategoryTag[] = [
  "category_weapon_simple",
  "category_weapon_simple_melee",
];

const SIMPLE_RANGED_TAGS: StartingEquipmentCategoryTag[] = [
  "category_weapon_simple",
  "category_weapon_simple_ranged",
];

const MARTIAL_MELEE_TAGS: StartingEquipmentCategoryTag[] = [
  "category_weapon_martial",
  "category_weapon_martial_melee",
];

const MARTIAL_RANGED_TAGS: StartingEquipmentCategoryTag[] = [
  "category_weapon_martial",
  "category_weapon_martial_ranged",
];

const createPlaceholderEquipment = (
  id: string,
  name: string,
  categoryTags: StartingEquipmentCategoryTag[] = [],
): EquipmentDefinition =>
  EquipmentDefinitionSchema.parse({ id, name, categoryTags });

const STARTING_EQUIPMENT_PLACEHOLDERS: Record<string, EquipmentDefinition> = {
  item_pack_explorers: createPlaceholderEquipment(
    "item_pack_explorers",
    "Explorer's Pack",
  ),
  item_weapon_javelin: createPlaceholderEquipment(
    "item_weapon_javelin",
    "Javelin",
    SIMPLE_MELEE_TAGS,
  ),
  item_weapon_greataxe: createPlaceholderEquipment(
    "item_weapon_greataxe",
    "Greataxe",
    MARTIAL_MELEE_TAGS,
  ),
  item_weapon_handaxe: createPlaceholderEquipment(
    "item_weapon_handaxe",
    "Handaxe",
    SIMPLE_MELEE_TAGS,
  ),
  item_weapon_rapier: createPlaceholderEquipment(
    "item_weapon_rapier",
    "Rapier",
    MARTIAL_MELEE_TAGS,
  ),
  item_pack_diplomats: createPlaceholderEquipment(
    "item_pack_diplomats",
    "Diplomat's Pack",
  ),
  item_pack_entertainers: createPlaceholderEquipment(
    "item_pack_entertainers",
    "Entertainer's Pack",
  ),
  item_musical_instrument_lute: createPlaceholderEquipment(
    "item_musical_instrument_lute",
    "Lute",
    ["category_musical_instrument"],
  ),
  item_weapon_mace: createPlaceholderEquipment(
    "item_weapon_mace",
    "Mace",
    SIMPLE_MELEE_TAGS,
  ),
  item_weapon_warhammer: createPlaceholderEquipment(
    "item_weapon_warhammer",
    "Warhammer",
    MARTIAL_MELEE_TAGS,
  ),
  item_armor_scale_mail: createPlaceholderEquipment(
    "item_armor_scale_mail",
    "Scale Mail",
  ),
  item_armor_chain_mail: createPlaceholderEquipment(
    "item_armor_chain_mail",
    "Chain Mail",
  ),
  item_weapon_crossbow_light: createPlaceholderEquipment(
    "item_weapon_crossbow_light",
    "Light Crossbow",
    SIMPLE_RANGED_TAGS,
  ),
  item_ammo_bolt: createPlaceholderEquipment("item_ammo_bolt", "Bolts"),
  item_pack_priests: createPlaceholderEquipment(
    "item_pack_priests",
    "Priest's Pack",
  ),
  item_armor_shield_wooden: createPlaceholderEquipment(
    "item_armor_shield_wooden",
    "Wooden Shield",
    ["category_armor_shield"],
  ),
  item_weapon_scimitar: createPlaceholderEquipment(
    "item_weapon_scimitar",
    "Scimitar",
    MARTIAL_MELEE_TAGS,
  ),
  item_weapon_arrow: createPlaceholderEquipment("item_weapon_arrow", "Arrows"),
  item_weapon_light_crossbow: createPlaceholderEquipment(
    "item_weapon_light_crossbow",
    "Light Crossbow",
    SIMPLE_RANGED_TAGS,
  ),
  item_weapon_crossbow_bolt: createPlaceholderEquipment(
    "item_weapon_crossbow_bolt",
    "Crossbow Bolts",
  ),
  item_pack_dungeoneers: createPlaceholderEquipment(
    "item_pack_dungeoneers",
    "Dungeoneer's Pack",
  ),
  item_weapon_dart: createPlaceholderEquipment(
    "item_weapon_dart",
    "Dart",
    SIMPLE_RANGED_TAGS,
  ),
  item_weapon_shortsword: createPlaceholderEquipment(
    "item_weapon_shortsword",
    "Shortsword",
    MARTIAL_MELEE_TAGS,
  ),
  item_pack_quiver: createPlaceholderEquipment("item_pack_quiver", "Quiver"),
  item_armor_scale: createPlaceholderEquipment(
    "item_armor_scale",
    "Scale Armor",
  ),
  item_tool_thieves_tools: createPlaceholderEquipment(
    "item_tool_thieves_tools",
    "Thieves' Tools",
  ),
  item_weapon_shortbow: createPlaceholderEquipment(
    "item_weapon_shortbow",
    "Shortbow",
    SIMPLE_RANGED_TAGS,
  ),
  item_pack_burglars: createPlaceholderEquipment(
    "item_pack_burglars",
    "Burglar's Pack",
  ),
  item_gear_component_pouch: createPlaceholderEquipment(
    "item_gear_component_pouch",
    "Component Pouch",
  ),
  item_pack_scholars: createPlaceholderEquipment(
    "item_pack_scholars",
    "Scholar's Pack",
  ),
  item_magic_item_spellbook: createPlaceholderEquipment(
    "item_magic_item_spellbook",
    "Spellbook",
  ),
  item_weapon_quarterstaff: createPlaceholderEquipment(
    "item_weapon_quarterstaff",
    "Quarterstaff",
    SIMPLE_MELEE_TAGS,
  ),
  item_incense_stick: createPlaceholderEquipment(
    "item_incense_stick",
    "Incense Stick",
  ),
  item_clothes_vestments: createPlaceholderEquipment(
    "item_clothes_vestments",
    "Vestments",
  ),
  item_clothes_common: createPlaceholderEquipment(
    "item_clothes_common",
    "Common Clothes",
  ),
  item_clothes_fine: createPlaceholderEquipment(
    "item_clothes_fine",
    "Fine Clothes",
  ),
  item_ring_signet: createPlaceholderEquipment(
    "item_ring_signet",
    "Signet Ring",
  ),
  item_scroll_pedigree: createPlaceholderEquipment(
    "item_scroll_pedigree",
    "Scroll of Pedigree",
  ),
  item_holy_symbol_amulet: createPlaceholderEquipment(
    "item_holy_symbol_amulet",
    "Holy Symbol (Amulet)",
    ["category_holy_symbol"],
  ),
  item_focus_wand: createPlaceholderEquipment("item_focus_wand", "Wand", [
    "category_arcane_focus",
  ]),
  item_focus_druidic_totem: createPlaceholderEquipment(
    "item_focus_druidic_totem",
    "Druidic Totem",
    ["category_druidic_focus"],
  ),
};

/**
 * Canonical authored rules dictionary for equipment.
 * Derived item and weapon dictionaries are projected from this source.
 */
const RAW_EQUIPMENT_DICTIONARY: Record<string, EquipmentDefinitionSeed> = {
  item_armor_padded: {
    id: "item_armor_padded",
    name: "Padded Armor",
    type: "armor",
    armorCategory: "light",
    weight: 8,
    equipSlot: "body",
    requiresAttunement: false,
    modifiers: [
      {
        // light armor: adds the full Dex modifier, so no maxDexCap
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_armor_leather: {
    id: "item_armor_leather",
    name: "Leather Armor",
    type: "armor",
    armorCategory: "light",
    weight: 10,
    equipSlot: "body",
    requiresAttunement: false,
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 11,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_armor_studded_leather: {
    id: "item_armor_studded_leather",
    name: "Studded Leather Armor",
    type: "armor",
    armorCategory: "light",
    weight: 13,
    equipSlot: "body",
    requiresAttunement: false,
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 12,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_armor_plate: {
    id: "item_armor_plate",
    name: "Plate Armor",
    type: "armor",
    armorCategory: "heavy",
    weight: 65,
    equipSlot: "body",
    requiresAttunement: false,
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "set_base",
        value: 18,
        scalingFactor: "none",
        // heavy armor ignores Dex entirely
        maxDexCap: 0,
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "STEALTH_CHECK",
        type: "disadvantage",
        value: 0,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_armor_shield: {
    id: "item_armor_shield",
    name: "Shield",
    type: "armor",
    weight: 6,
    equipSlot: "off_hand",
    requiresAttunement: false,
    categoryTags: ["category_armor_shield"],
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 2,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_ring_of_protection: {
    id: "item_ring_of_protection",
    name: "Ring of Protection",
    // a ring is worn, but it is not armor: slot legality comes from equipSlot,
    // so the type is now purely descriptive
    type: "wondrous",
    weight: 0,
    equipSlot: "ring",
    requiresAttunement: true,
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "ALL_SAVES",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  item_weapon_longsword: {
    id: "item_weapon_longsword",
    name: "Longsword",
    type: "weapon",
    weight: 3,
    equipSlot: "main_hand",
    requiresAttunement: false,
    categoryTags: MARTIAL_MELEE_TAGS,
    weapon: {
      category: "martial_melee",
      damageDice: "1d8",
      versatileDamageDice: "1d10",
      damageType: "slashing",
      properties: ["versatile"],
      range: 5,
      longRange: undefined,
    },
  },

  item_weapon_dagger: {
    id: "item_weapon_dagger",
    name: "Dagger",
    type: "weapon",
    weight: 1,
    equipSlot: "main_hand",
    requiresAttunement: false,
    categoryTags: SIMPLE_MELEE_TAGS,
    weapon: {
      category: "simple_melee",
      damageDice: "1d4",
      damageType: "piercing",
      properties: ["finesse", "light", "thrown"],
      range: 20,
      longRange: 60,
    },
  },

  item_weapon_longbow: {
    id: "item_weapon_longbow",
    name: "Longbow",
    type: "weapon",
    weight: 2,
    equipSlot: "main_hand",
    requiresAttunement: false,
    categoryTags: MARTIAL_RANGED_TAGS,
    weapon: {
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition", "heavy", "two_handed"],
      range: 150,
      longRange: 600,
      ammoItemId: "item_ammo_arrow",
      ammoTag: "arrow",
    },
  },

  item_ammo_arrow: {
    id: "item_ammo_arrow",
    name: "Arrow",
    type: "consumable",
    // PHB sells arrows by the score; the per-arrow weight is 1/20 lb
    weight: 0.05,
    requiresAttunement: false,
    ammoTag: "arrow",
  },

  item_ammo_arrow_plus_one: {
    id: "item_ammo_arrow_plus_one",
    name: "+1 Arrow",
    type: "consumable",
    weight: 0.05,
    requiresAttunement: false,
    // the same tag is what makes it loadable in any bow that fires arrows
    ammoTag: "arrow",
    modifiers: [
      {
        target: "ATTACK_BONUS",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
      {
        target: "DAMAGE_BONUS",
        type: "add",
        value: 1,
        scalingFactor: "none",
        requiredStates: [],
        forbiddenStates: [],
      },
    ],
  },

  // worn on the body without being armor - wondrous for the same reason the
  // ring is: worn, but not armor. the distinction matters, because rules that
  // ask "are you wearing armor" - Unarmored Defense, Fast Movement - must read
  // the item's type, not merely that the body slot is occupied
  item_robe: {
    id: "item_robe",
    name: "Robe",
    type: "wondrous",
    weight: 4,
    equipSlot: "body",
    requiresAttunement: false,
  },

  // PHB containers. capacity is pounds of gear only: the book also gives each
  // a volume, and gives quivers and cases an item count instead, but neither
  // is a weight limit and neither has a rule here yet
  item_backpack: {
    id: "item_backpack",
    name: "Backpack",
    type: "gear",
    weight: 5,
    requiresAttunement: false,
    container: { capacityPounds: 30 },
  },

  item_sack: {
    id: "item_sack",
    name: "Sack",
    type: "gear",
    // the PHB prints 1/2 lb. authored as the decimal because weight is summed
    // in hundredths, so this is exactly 50 and never a rounding argument
    weight: 0.5,
    requiresAttunement: false,
    container: { capacityPounds: 30 },
  },

  item_pouch: {
    id: "item_pouch",
    name: "Pouch",
    type: "gear",
    weight: 1,
    requiresAttunement: false,
    container: { capacityPounds: 6 },
  },

  item_basket: {
    id: "item_basket",
    name: "Basket",
    type: "gear",
    weight: 2,
    requiresAttunement: false,
    container: { capacityPounds: 40 },
  },

  item_chest: {
    id: "item_chest",
    name: "Chest",
    type: "gear",
    weight: 25,
    requiresAttunement: false,
    container: { capacityPounds: 300 },
  },

  ...STARTING_EQUIPMENT_PLACEHOLDERS,
};

export const EQUIPMENT_DICTIONARY: Record<string, EquipmentDefinition> =
  Object.fromEntries(
    Object.entries(RAW_EQUIPMENT_DICTIONARY).map(([equipmentId, equipment]) => [
      equipmentId,
      EquipmentDefinitionSchema.parse(equipment),
    ]),
  );

export const toItemDefinition = (
  equipment: EquipmentDefinition,
): ItemDefinition => {
  const base: ItemDefinition = {
    id: equipment.id,
    name: equipment.name,
    type: equipment.type,
    weight: equipment.weight,
    requiresAttunement: equipment.requiresAttunement,
    categoryTags: equipment.categoryTags,
    // these stay absent rather than undefined so the projection keeps matching
    // the exact-shape assertions the dictionary tests make
    ...(equipment.armorCategory && { armorCategory: equipment.armorCategory }),
    ...(equipment.equipSlot && { equipSlot: equipment.equipSlot }),
    ...(equipment.ammoTag && { ammoTag: equipment.ammoTag }),
    ...(equipment.container && { container: equipment.container }),
    ...(equipment.modifiers && { modifiers: equipment.modifiers }),
  };

  return base;
};

export const toWeaponDefinition = (
  equipment: EquipmentDefinition,
): WeaponDefinition | undefined => {
  if (!equipment.weapon) {
    return undefined;
  }

  return {
    id: equipment.id,
    name: equipment.name,
    ...equipment.weapon,
  };
};

const equipmentEntries = Object.entries(EQUIPMENT_DICTIONARY);

export const ITEM_DICTIONARY: Record<string, ItemDefinition> =
  Object.fromEntries(
    equipmentEntries.map(([equipmentId, equipment]) => [
      equipmentId,
      toItemDefinition(equipment),
    ]),
  );

export const WEAPON_DICTIONARY: Record<string, WeaponDefinition> =
  Object.fromEntries(
    equipmentEntries.flatMap(([equipmentId, equipment]) => {
      const weapon = toWeaponDefinition(equipment);
      if (!weapon) {
        return [];
      }
      return [[equipmentId, weapon]];
    }),
  );
