/**
 * Represents the payload for a level-up event in a character's progression.
 * This payload contains all necessary information to process a level-up, including the character's ID, the target class for leveling up, the new total level, and any choices made during the level-up process (e.g., hit point roll, subclass selection, ability score improvements, feats, traits, and spell changes).
 */
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
