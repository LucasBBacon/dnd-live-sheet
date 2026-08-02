import type {
  ChoiceProficiencyGrant,
  FixedProficiencyGrant,
  ProficiencyLevel,
  TraitDefinition,
} from "@project/shared";

/**
 * A choice block the character has unlocked but not answered yet, stamped with
 * the trait it came from so a level-up UI can prompt for it.
 */
export interface PendingProficiencyChoice extends ChoiceProficiencyGrant {
  traitId: string;
  remainingPicks: number;
}

const PROFICIENCY_LEVEL_RANK: Record<ProficiencyLevel, number> = {
  half: 0,
  proficient: 1,
  expertise: 2,
};

/**
 * Two grants only collapse into one if they are conditioned on the same states.
 * A conditional expertise and an unconditional proficiency on the same skill
 * are genuinely different grants, and SkillEngine picks between them per roll.
 */
const toGrantKey = (grant: FixedProficiencyGrant): string =>
  `${grant.category}:${grant.proficiencyId}:${[...grant.requiredStates].sort().join(",")}`;

/**
 * Flattens the proficiencies a character's traits carry into concrete grants,
 * resolving any choice blocks against the player's saved picks. The counterpart
 * to ModifierExtractor, and takes the same selections table
 * (CharacterBootstrapper.resolveSelections), here keyed by
 * ChoiceProficiencyGrant.id.
 */
export class ProficiencyExtractor {
  public static extractProficiencies(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): FixedProficiencyGrant[] {
    // keyed so that the same proficiency granted twice keeps the better level -
    // a rogue with Expertise in Stealth should not be dragged back to plain
    // proficiency by the racial grant that also hands it out
    const grantsByKey = new Map<string, FixedProficiencyGrant>();

    const collect = (grant: FixedProficiencyGrant) => {
      const key = toGrantKey(grant);
      const existing = grantsByKey.get(key);

      if (
        !existing ||
        PROFICIENCY_LEVEL_RANK[grant.level] >
          PROFICIENCY_LEVEL_RANK[existing.level]
      ) {
        grantsByKey.set(key, grant);
      }
    };

    for (const trait of traits) {
      // 1 - extract fixed proficiencies
      for (const fixed of trait.proficiencies?.fixed ?? []) {
        collect(fixed);
      }

      // 2 - resolve choice blocks against the player's picks
      for (const choice of trait.proficiencies?.choices ?? []) {
        for (const proficiencyId of this.resolveChoice(
          choice,
          selections[choice.id],
        )) {
          collect({
            category: choice.category,
            proficiencyId,
            level: choice.level,
            requiredStates: choice.requiredStates,
          });
        }
      }
    }

    return [...grantsByKey.values()];
  }

  /**
   * The choice blocks still waiting on the player, for the character builder to
   * render. A block half answered reports only what is left to pick.
   */
  public static listPendingChoices(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): PendingProficiencyChoice[] {
    const pending: PendingProficiencyChoice[] = [];

    for (const trait of traits) {
      for (const choice of trait.proficiencies?.choices ?? []) {
        const answered = this.resolveChoice(choice, selections[choice.id]);
        const remainingPicks = choice.chooseAmount - answered.length;

        if (remainingPicks > 0) {
          pending.push({ ...choice, traitId: trait.id, remainingPicks });
        }
      }
    }

    return pending;
  }

  /**
   * The legal, de-duplicated picks for one choice block, capped at what the
   * block actually offers. Stale picks are dropped rather than thrown on, so a
   * renamed rulebook option costs the character that one proficiency instead of
   * breaking the whole sheet.
   */
  private static resolveChoice(
    choice: ChoiceProficiencyGrant,
    selected: string[] | undefined,
  ): string[] {
    if (!selected?.length) return [];

    // an absent option list means "anything from this category". An empty one
    // means the same: a block that offers nothing could never be answered
    const isPermitted = (proficiencyId: string) =>
      !choice.options?.length || choice.options.includes(proficiencyId);

    return [...new Set(selected)]
      .filter(isPermitted)
      .slice(0, choice.chooseAmount);
  }
}
