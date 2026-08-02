import type {
  ChoiceProficiencyGrant,
  FixedProficiencyGrant,
  ProficiencyLevel,
  TraitDefinition,
  TraitProficiencyCategory,
} from "@project/shared";
import { listProficiencyOptions } from "../rules/proficiencyDictionary.js";
import type {
  ChoiceRejection,
  ChoiceResolution,
} from "./choiceResolution.js";

export interface ProficiencyChoiceResolution extends ChoiceResolution {
  category: TraitProficiencyCategory;
  /** what the block grants, which a builder needs to label an expertise pick */
  level: ProficiencyLevel;
  /**
   * What the character may still take: the block's roster minus everything
   * this pick would be wasted on. Undefined where the category has no roster
   * and the block named no options, i.e. the pick is unbounded.
   */
  availableOptions: string[] | undefined;
}

/**
 * A choice block the character has unlocked but not finished answering.
 */
export type PendingProficiencyChoice = ProficiencyChoiceResolution;

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

const toHeldKey = (
  category: TraitProficiencyCategory,
  proficiencyId: string,
): string => `${category}:${proficiencyId}`;

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
    return this.compile(traits, selections).grants;
  }

  /**
   * Every choice block on the character, with the picks it accepted and the
   * ones it refused. Save validation reads this to explain the refusals.
   */
  public static resolveChoices(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): ProficiencyChoiceResolution[] {
    return this.compile(traits, selections).resolutions;
  }

  /**
   * The choice blocks still waiting on the player, for the character builder to
   * render. A block half answered reports only what is left to pick.
   */
  public static listPendingChoices(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): PendingProficiencyChoice[] {
    return this.compile(traits, selections).resolutions.filter(
      (resolution) => resolution.remainingPicks > 0,
    );
  }

  /**
   * Fixed grants are collected before any choice block resolves, because a
   * choice is judged against the finished character: a half-elf must not be
   * allowed to spend their free language on Elvish, which the very same trait
   * hands them for free. Resolved picks then feed forward, so two language
   * blocks on one character cannot both land on Dwarvish.
   */
  private static compile(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): {
    grants: FixedProficiencyGrant[];
    resolutions: ProficiencyChoiceResolution[];
  } {
    // keyed so that the same proficiency granted twice keeps the better level -
    // a rogue with Expertise in Stealth should not be dragged back to plain
    // proficiency by the racial grant that also hands it out
    const grantsByKey = new Map<string, FixedProficiencyGrant>();

    // what the character holds outright, for deciding whether a pick is wasted.
    // state-gated grants are deliberately excluded: Artificer's Lore giving
    // expertise on History checks about magic items is not a reason to stop
    // someone taking History proficiency for every other check
    const heldLevels = new Map<string, number>();

    const collect = (grant: FixedProficiencyGrant) => {
      const key = toGrantKey(grant);
      const existing = grantsByKey.get(key);
      const rank = PROFICIENCY_LEVEL_RANK[grant.level];

      if (!existing || rank > PROFICIENCY_LEVEL_RANK[existing.level]) {
        grantsByKey.set(key, grant);
      }

      if (grant.requiredStates.length > 0) return;

      const heldKey = toHeldKey(grant.category, grant.proficiencyId);
      heldLevels.set(heldKey, Math.max(heldLevels.get(heldKey) ?? -1, rank));
    };

    // pass 1 - every unconditional starting point
    for (const trait of traits) {
      for (const fixed of trait.proficiencies?.fixed ?? []) {
        collect(fixed);
      }
    }

    // pass 2 - resolve choice blocks against that baseline, accumulating
    const resolutions: ProficiencyChoiceResolution[] = [];

    for (const trait of traits) {
      for (const choice of trait.proficiencies?.choices ?? []) {
        const resolution = this.resolveChoice(
          choice,
          selections[choice.id],
          trait,
          heldLevels,
        );

        for (const proficiencyId of resolution.accepted) {
          collect({
            category: choice.category,
            proficiencyId,
            level: choice.level,
            requiredStates: choice.requiredStates,
          });
        }

        // recomputed after collecting, so the options offered for the picks
        // still owed already exclude what this block just granted
        resolutions.push({
          ...resolution,
          availableOptions: this.availableOptions(choice, heldLevels),
        });
      }
    }

    return { grants: [...grantsByKey.values()], resolutions };
  }

  /**
   * What the block offers before the character is considered: its own option
   * list, or the category roster when it names none. Undefined means the pick
   * is unbounded - a category with no roster yet, chosen freely.
   */
  private static rosterFor(
    choice: ChoiceProficiencyGrant,
  ): string[] | undefined {
    // an absent option list means "anything from this category". An empty one
    // means the same: a block that offers nothing could never be answered
    if (choice.options?.length) return choice.options;

    return listProficiencyOptions(choice.category);
  }

  /**
   * A pick is only worth offering if it would actually improve the character.
   *
   * This cannot be a flat "exclude what they already have": Expertise is a
   * skills block that exists precisely to be spent on skills you are already
   * proficient in. Comparing levels covers both - an equal or better grant
   * already in hand makes the pick a waste, a weaker one does not.
   */
  private static isWorthTaking(
    choice: ChoiceProficiencyGrant,
    proficiencyId: string,
    heldLevels: Map<string, number>,
  ): boolean {
    const held = heldLevels.get(toHeldKey(choice.category, proficiencyId));

    return held === undefined || PROFICIENCY_LEVEL_RANK[choice.level] > held;
  }

  private static availableOptions(
    choice: ChoiceProficiencyGrant,
    heldLevels: Map<string, number>,
  ): string[] | undefined {
    return this.rosterFor(choice)?.filter((proficiencyId) =>
      this.isWorthTaking(choice, proficiencyId, heldLevels),
    );
  }

  /**
   * Walks the picks in order, keeping the legal ones until the block is full.
   * A stale pick is refused rather than thrown on, so a renamed rulebook option
   * costs the character that one proficiency instead of breaking the sheet -
   * validation is what turns the refusal into something the player can see.
   */
  private static resolveChoice(
    choice: ChoiceProficiencyGrant,
    selected: string[] | undefined,
    trait: TraitDefinition,
    heldLevels: Map<string, number>,
  ): ProficiencyChoiceResolution {
    const roster = this.rosterFor(choice);
    const accepted: string[] = [];
    const rejected: ChoiceRejection[] = [];

    for (const selectedId of selected ?? []) {
      if (roster && !roster.includes(selectedId)) {
        rejected.push({ selectedId, reason: "not_an_option" });
        continue;
      }

      if (accepted.includes(selectedId)) {
        rejected.push({ selectedId, reason: "duplicate" });
        continue;
      }

      if (!this.isWorthTaking(choice, selectedId, heldLevels)) {
        rejected.push({ selectedId, reason: "already_held" });
        continue;
      }

      if (accepted.length >= choice.chooseAmount) {
        rejected.push({ selectedId, reason: "over_limit" });
        continue;
      }

      accepted.push(selectedId);
    }

    return {
      traitId: trait.id,
      traitName: trait.name,
      choiceId: choice.id,
      category: choice.category,
      level: choice.level,
      chooseAmount: choice.chooseAmount,
      accepted,
      rejected,
      remainingPicks: choice.chooseAmount - accepted.length,
      availableOptions: undefined, // filled in by compile once picks are collected
    };
  }
}
