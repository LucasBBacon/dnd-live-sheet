export type WeaponCategory =
  | "simple_melee"
  | "martial_melee"
  | "simple_ranged"
  | "martial_ranged";
export type WeaponProperty =
  | "finesse"
  | "thrown"
  | "heavy"
  | "light"
  | "two_handed"
  | "versatile"
  | "reach"
  | "ammunition"
  | "loading"
  | "special";

export interface WeaponDefinition {
  id: string;
  name: string;
  category: WeaponCategory;
  damageDice: string; // e.g., '1d8'
  damageType: string; // e.g., 'slashing'
  properties: WeaponProperty[];
  ammoItemId?: string;
}
