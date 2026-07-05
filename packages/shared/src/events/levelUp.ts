export interface LevelUpPayload {
  characterId: string;
  targetClassId: string; // enables multiclassing
  newTotalLevel: number;

  // aggregated choices
  hpRoll: number; // raw roll (or taken average)
  subclassId?: string; // strict requirement if the class grants it at this level
  asiChoices?: { stat: string; value: number }[];
  featId?: string;
  selectedTraits?: string[];
  addedSpells?: string[];
  replacedSpells?: { oldSpellId: string; newSpellId: string }[];
}
