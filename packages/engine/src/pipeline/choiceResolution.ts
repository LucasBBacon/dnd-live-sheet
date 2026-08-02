/**
 * The shared vocabulary between the extractors and save validation.
 *
 * An extractor has to be forgiving at runtime - a pick that has gone stale
 * costs the character that one grant rather than breaking their sheet - but
 * "silently dropped" is exactly what a character builder needs to be told
 * about. So the extractors report every pick they refused and why, and
 * CharacterBootstrapper.collectSaveIssues translates that into validation
 * issues. The rules live in one place; validation only renames the result.
 */

export type ChoiceRejectionReason =
  /** not on the block's own option list, nor on its category roster */
  | "not_an_option"
  /** an equal or better grant is already in hand, so the pick buys nothing */
  | "already_held"
  /** repeated inside a block that does not allow the same pick twice */
  | "duplicate"
  /** legal, but past the number of picks the block hands out */
  | "over_limit";

export interface ChoiceRejection {
  selectedId: string;
  reason: ChoiceRejectionReason;
}

export interface ChoiceResolution {
  traitId: string;
  traitName: string;
  choiceId: string;
  chooseAmount: number;
  /** picks that survived, in the order the block will apply them */
  accepted: string[];
  rejected: ChoiceRejection[];
  /** how many picks the player still owes this block */
  remainingPicks: number;
}
