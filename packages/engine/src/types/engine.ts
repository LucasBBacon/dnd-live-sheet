export type ModifierTarget =
  | "AC"
  | "INITIATIVE"
  | "SPEED"
  | "STR_SAVE"
  | "ALL_SAVES"
  | "STEALTH_CHECK"
  | "ATTACK_BONUS"
  | "MAX_HP"
  | "ARMOR_CLASS"
  | "INITIATIVE"
  | "SPEED"; // TODO: ADD REST!!
export type ModType =
  | "set_base"
  | "add"
  | "multiplier"
  | "advantage"
  | "disadvantage";

export interface Modifier {
  id: string; // unique instance ID
  target: ModifierTarget; // what is being modified
  type: ModType; // how it is modified
  value: number; // numerical payload

  // metadata (FOR RULE STACKING)
  sourceName: string; // e.g., "Ring of Protection"
  sourceOrigin: string; // e.g., "Item", "Class: Monk", "Spell", etc
  isActive: boolean; // allows toggling without deleting record
}
