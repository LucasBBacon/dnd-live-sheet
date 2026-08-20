/**
 * What surprise costs you this turn, and whether anything gives it back.
 *
 * Surprise is reported, never enforced. The economy runs a "track" policy
 * everywhere else, and a rule this dependent on the DM's adjudication is the
 * last place to start blocking buttons - so this returns something for the
 * sheet to say, not a verdict the resolver acts on.
 *
 * The engine models the two restrictions it can express - the action and the
 * reaction. RAW also forbids movement while surprised; movement is not tracked
 * for anyone, so that third restriction is absent here rather than
 * half-modelled, and stays the table's business.
 */

/** The state Feral Instinct puts on the sheet while the character has it. */
export const FERAL_INSTINCT_STATE = "status_feral_instinct";

/** The state Rage grants, and the only evidence needed that rage was entered. */
export const RAGING_STATE = "status_raging";

const INCAPACITATED_STATE = "incapacitated";

export type SurpriseOutcome =
  /** Not surprised, so nothing to report. */
  | "not_surprised"
  /** Surprised, with nothing lifting it: no action, no reaction. */
  | "restricted"
  /** Surprised, but a trait would lift it if the character raged. */
  | "release_available"
  /** Surprised, and free to act anyway. */
  | "released";

export interface SurpriseReport {
  outcome: SurpriseOutcome;
  /** The line the sheet shows, phrased for the player. Empty when silent. */
  summary: string;
}

export interface SurpriseInput {
  /** Whether the character was surprised at the start of this combat. */
  surprised: boolean;
  /** The character's full state list, as the calculators receive it. */
  activeStates: string[];
}

export class SurpriseEngine {
  /**
   * Turns the surprise flag and the character's states into one line the sheet
   * can show.
   *
   * Raging is read from the state rather than from which action spent the
   * bonus action, so this stays free of any knowledge of action ids. The cost
   * is that a character who was *already* raging when combat began reads as
   * having entered it - "before doing anything else on that turn" is a rider
   * this deliberately does not police, and the summary says so.
   * @param input The surprise flag and the active state list.
   * @returns The outcome and the line to show for it.
   */
  public static describe(input: SurpriseInput): SurpriseReport {
    if (!input.surprised) {
      return { outcome: "not_surprised", summary: "" };
    }

    const has = (state: string) => input.activeStates.includes(state);

    if (!has(FERAL_INSTINCT_STATE)) {
      return {
        outcome: "restricted",
        summary: "Surprised: no action or reaction on your first turn.",
      };
    }

    // the trait's own gate. it withholds the release rather than the whole
    // trait: the initiative advantage is a separate, ungated clause
    if (has(INCAPACITATED_STATE)) {
      return {
        outcome: "restricted",
        summary:
          "Surprised: no action or reaction. Feral Instinct cannot help while you are incapacitated.",
      };
    }

    if (has(RAGING_STATE)) {
      return {
        outcome: "released",
        summary: "Feral Instinct: you are raging, so you may act normally.",
      };
    }

    return {
      outcome: "release_available",
      summary:
        "Surprised: enter your rage before anything else to act normally this turn.",
    };
  }
}
