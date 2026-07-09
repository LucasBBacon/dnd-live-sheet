export type DecisionType =
  | "subclass"
  | "subrace"
  | "asi_or_feat"
  | "spell_selection"
  | "trait_selection";

export interface LevelDecision {
  id: string;
  type: DecisionType;
  description: string;
  options?: string[]; // id of available choices, if restricted
  isRequired: boolean; // strictly enforces selection
  quantity?: number; // how many choices to make (e.g., choose 2 skills)
}

/**
 * Represents the progression details for a specific class at a given level, including automatically granted traits and user-interactive decisions.
 * This interface is used to define the structure of class progression data, which can be utilized for validating level-up actions and determining the effects of leveling up in a role-playing game context.
 */
export interface ClassProgression {
  classId: string;
  level: number;
  // granted automatically
  grantedTraits: string[];
  // requires user interaction
  decisions: LevelDecision[];
}
