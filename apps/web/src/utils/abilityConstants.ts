import type { Ability } from "@project/engine";

export const ABILITY_STATS: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};