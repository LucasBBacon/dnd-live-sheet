import type { HitDicePool } from "./resources.js";

export type {
  WeaponCategory,
  WeaponAttackContext,
  WeaponAttackUsage,
  WeaponDefinition,
  WeaponProperty,
} from "@project/shared";

export interface RuntimeHealthState {
  currentHp: number;
  tempHp: number;
  hitDice: Record<string, HitDicePool>;
}
