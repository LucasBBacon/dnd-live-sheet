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
        value: 11,
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
        value: 18,
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

  item_armor_shield: {
    id: "item_armor_shield",
    name: "Shield",
    type: "armor",
    modifiers: [
      {
        target: "ARMOR_CLASS",
        type: "add",
        value: 2,
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

  item_weapon_longsword: {
    id: "item_weapon_longsword",
    name: "Longsword",
    type: "weapon",
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
  if (equipment.modifiers) {
    return {
      id: equipment.id,
      name: equipment.name,
      type: equipment.type,
      modifiers: equipment.modifiers,
    };
  }

  return {
    id: equipment.id,
    name: equipment.name,
    type: equipment.type,
  };
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