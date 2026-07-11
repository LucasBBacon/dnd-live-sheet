import type { WeaponDefinition } from "../types/combat.js";

export const WEAPON_DICTIONARY: Record<string, WeaponDefinition> = {
  item_weapon_longsword: {
    id: "item_weapon_longsword",
    name: "Longsword",
    category: "martial_melee",
    damageDice: "1d8",
    damageType: "slashing",
    properties: ["versatile"],
  },
  item_weapon_dagger: {
    id: "item_weapon_dagger",
    name: "Dagger",
    category: "simple_melee",
    damageDice: "1d4",
    damageType: "piercing",
    properties: ["finesse", "light", "thrown"],
  },
  item_weapon_longbow: {
    id: "item_weapon_longbow",
    name: "Longbow",
    category: "martial_ranged",
    damageDice: "1d8",
    damageType: "piercing",
    properties: ["ammunition", "heavy", "two_handed"],
    ammoItemId: "item_ammo_arrow",
  },
};
