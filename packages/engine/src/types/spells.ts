import type { Ability } from "./core.js";

export type PreparationMode = "known" | "prepared" | "full_list" | "innate";

export interface RuntimeSpellSource {
  sourceId: string; // e.g., 'class_wizard', 'race_tiefling'
  sourceName: string; // 'Wizard', 'Infernal Legacy'
  governingStat: Ability;
  preparationMode: PreparationMode;

  // ids of spells this source currently has access to
  knownSpellIds: string[];

  // ids of spells currently prepare for the day
  // irrelevant if mod is known or innate
  preparedSpellIds: string[];

  // for clerics/wizards, max number they can prepare for today
  maxPreparedLimit?: number;
}
