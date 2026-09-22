type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

/**
 * Represents the payload for a level-up event in a character's progression.
 * It carries the character's ID, the target class, the new total level, and
 * the choices made at this level: the hit point roll, a subclass, ability
 * score improvements or a feat, and picks. A spell pick is a class or trait
 * pick like any other, keyed by its node, so it travels in selectedTraits or
 * traitSelections (#79).
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
}
