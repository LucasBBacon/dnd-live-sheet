import type {
  EquipmentDefinition,
  ItemDefinition,
  WeaponDefinition,
} from "@project/shared";

/**
 * Canonical authored rules dictionary for equipment.
 * Derived item and weapon dictionaries are projected from this source.
 */
export const EQUIPMENT_DICTIONARY: Record<string, EquipmentDefinition> = {
  item_armor_padded: {
    id: "item_armor_padded",
    name: "Padded Armor",
    type: "armor",
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
    weapon: {
      category: "martial_melee",
      damageDice: "1d8",
      damageType: "slashing",
      properties: ["versatile"],
    },
  },

  item_weapon_dagger: {
    id: "item_weapon_dagger",
    name: "Dagger",
    type: "weapon",
    weight: 1,
    equipSlot: "main_hand",
    requiresAttunement: false,
    weapon: {
      category: "simple_melee",
      damageDice: "1d4",
      damageType: "piercing",
      properties: ["finesse", "light", "thrown"],
    },
  },

  item_weapon_longbow: {
    id: "item_weapon_longbow",
    name: "Longbow",
    type: "weapon",
    weight: 2,
    equipSlot: "main_hand",
    requiresAttunement: false,
    weapon: {
      category: "martial_ranged",
      damageDice: "1d8",
      damageType: "piercing",
      properties: ["ammunition", "heavy", "two_handed"],
      ammoItemId: "item_ammo_arrow",
    },
  },
};

export const toItemDefinition = (equipment: EquipmentDefinition): ItemDefinition => {
  const base: ItemDefinition = {
    id: equipment.id,
    name: equipment.name,
    type: equipment.type,
    weight: equipment.weight,
    requiresAttunement: equipment.requiresAttunement,
    // both stay absent rather than undefined so the projection keeps matching
    // the exact-shape assertions the dictionary tests make
    ...(equipment.equipSlot && { equipSlot: equipment.equipSlot }),
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

export const ITEM_DICTIONARY: Record<string, ItemDefinition> = Object.fromEntries(
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