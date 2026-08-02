import type {
  ChoiceModifierGrant,
  ModifierTarget,
  RuntimeModifier,
  TraitDefinition,
  TraitModifier,
} from "@project/shared";
import type {
  ChoiceRejection,
  ChoiceResolution,
} from "./choiceResolution.js";

export interface ModifierChoiceResolution extends ChoiceResolution {
  accepted: ModifierTarget[];
}

/**
 * Flattens the static math a character's traits carry into RuntimeModifiers the
 * calculators can consume, resolving any parameterized choice blocks against
 * the player's saved picks along the way.
 *
 * Selections come from CharacterBootstrapper.resolveSelections and are keyed by
 * ChoiceModifierGrant.id.
 */
export class ModifierExtractor {
  public static extractModifiers(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): RuntimeModifier[] {
    const runtimeMods: RuntimeModifier[] = [];

    for (const trait of traits) {
      // 1 - extract fixed modifiers
      for (const mod of trait.modifiers?.fixed ?? []) {
        runtimeMods.push(this.mapToRuntime(mod, trait, runtimeMods.length));
      }

      // 2 - extract parameterized choice modifiers
      for (const choice of trait.modifiers?.choices ?? []) {
        const { accepted } = this.resolveChoice(
          choice,
          selections[choice.id],
          trait,
        );

        for (const target of accepted) {
          // synthesize a concrete base modifier from the template
          const synthesizedMod: TraitModifier = {
            target,
            type: choice.modifierTemplate.type,
            value: choice.modifierTemplate.value,
            scalingFactor: choice.modifierTemplate.scalingFactor,
            ...(choice.modifierTemplate.scalingClassId !== undefined && {
              scalingClassId: choice.modifierTemplate.scalingClassId,
            }),
            // templates apply universally: a choice block has no state gating
            requiredStates: [],
            forbiddenStates: [],
          };

          runtimeMods.push(
            this.mapToRuntime(synthesizedMod, trait, runtimeMods.length),
          );
        }
      }
    }

    return runtimeMods;
  }

  /**
   * The same resolution extractModifiers performs, reported rather than
   * applied, so save validation can explain the picks that will be ignored.
   */
  public static resolveChoices(
    traits: TraitDefinition[],
    selections: Record<string, string[]>,
  ): ModifierChoiceResolution[] {
    return traits.flatMap((trait) =>
      (trait.modifiers?.choices ?? []).map((choice) =>
        this.resolveChoice(choice, selections[choice.id], trait),
      ),
    );
  }

  /**
   * Walks the picks in order, keeping the legal ones until the block is full.
   * Order matters: it is what decides which of four picks a two-pick block
   * honours, so the player's own ordering wins.
   */
  private static resolveChoice(
    choice: ChoiceModifierGrant,
    selected: string[] | undefined,
    trait: TraitDefinition,
  ): ModifierChoiceResolution {
    const accepted: ModifierTarget[] = [];
    const rejected: ChoiceRejection[] = [];

    for (const selectedId of selected ?? []) {
      // guardrail: the pick has to be a legal option on the blueprint.
      // a save can go stale when a rulebook option is renamed or dropped
      if (!this.isPermittedOption(choice.options, selectedId)) {
        rejected.push({ selectedId, reason: "not_an_option" });
        continue;
      }

      // a repeated pick is only spent twice if the block says it stacks
      // (half-elf's +1/+1 must land on two different abilities)
      if (!choice.allowDuplicates && accepted.includes(selectedId)) {
        rejected.push({ selectedId, reason: "duplicate" });
        continue;
      }

      // the block also caps how many picks it is willing to honour
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
      chooseAmount: choice.chooseAmount,
      accepted,
      rejected,
      remainingPicks: choice.chooseAmount - accepted.length,
    };
  }

  private static isPermittedOption(
    options: ModifierTarget[],
    target: string,
  ): target is ModifierTarget {
    return (options as string[]).includes(target);
  }

  private static mapToRuntime(
    mod: TraitModifier,
    sourceTrait: TraitDefinition,
    index: number,
  ): RuntimeModifier {
    return {
      ...mod,
      // the index keeps ids unique across a trait's several modifiers, which
      // DerivedStatEngine relies on to tell competing set_base entries apart
      id: `${sourceTrait.id}_${index}`,
      // stamp the trait's metadata onto the mod for UI breakdowns
      sourceName: sourceTrait.name,
      sourceOrigin: `trait:${sourceTrait.id}`,
      isActive: true,
    };
  }
}
