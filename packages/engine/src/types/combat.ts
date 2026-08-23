import type { HitDicePool } from "./resources.js";

export type {
  WeaponCategory,
  WeaponAttackContext,
  WeaponAttackUsage,
  WeaponProperty,
} from "@project/shared";
export type { WeaponView } from "../rules/equipmentProjection.js";

export interface RuntimeHealthState {
  currentHp: number;
  tempHp: number;
  hitDice: Record<string, HitDicePool>;
}
