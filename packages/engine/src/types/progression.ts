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

export interface ClassProgression {
  classId: string;
  level: number;
  // granted automatically
  grantedTraits: string[];
  // requires user interaction
  decisions: LevelDecision[];
}
