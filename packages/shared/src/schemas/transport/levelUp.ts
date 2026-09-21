type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

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
  asiChoices?: { stat: Ability; value: number }[];
  featId?: string;
  // class progression picks made at this level, keyed by the grant's nodeId
  selectedTraits?: Record<string, string[]>;
  // trait choice-block picks that arrive with this level, keyed by block id
  traitSelections?: Record<string, string[]>;
  addedSpells?: string[];
  replacedSpells?: { oldSpellId: string; newSpellId: string }[];
}
