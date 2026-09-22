/**
 * The decisions a player can make when leveling up: a subclass, a subrace,
 * an ability score improvement (ASI) or feat, or a trait selection. Spell
 * picks are not level decisions - they are choice questions
 * (listChoiceQuestions), answered like any class or trait pick (#79).
 */
export type DecisionType =
  | "subclass"
  | "subrace"
  | "asi_or_feat"
  | "trait_selection";

/**
 * Represents a decision that a player must make when leveling up their character, such as choosing a subclass, subrace, ability score improvement (ASI), feat, spell, or trait. This interface is used to define the structure of level-up decisions in a role-playing game context.
 */
export interface LevelDecision {
  id: string;
  type: DecisionType;
  description: string;
  options?: string[]; // id of available choices, if restricted
  isRequired: boolean; // strictly enforces selection
  quantity?: number; // how many choices to make (e.g., choose 2 skills)
  /**
   * Where this decision's answer travels in the level-up payload. A trait's
   * own choice block (e.g. the rogue multiclass skill pick, Lore's bonus
   * skills) is answered through `payload.traitSelections`, keyed by block id.
   * Everything else (class progression picks such as a fighting style) is
   * answered through `payload.selectedTraits`, keyed by nodeId. Mirrors the
   * server's `ResolverDecision.source` (apps/server/src/services/levelUpValidation.ts).
   */
  source?: "trait_choice_block";
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
