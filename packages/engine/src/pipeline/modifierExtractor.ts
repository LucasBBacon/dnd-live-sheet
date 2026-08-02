import type {
  ModifierTarget,
  RuntimeModifier,
  TraitDefinition,
  TraitModifier,
} from "@project/shared";

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
        // look up the player's saved targets for this specific choice id
        const selectedTargets = selections[choice.id] ?? [];
        const applied: ModifierTarget[] = [];

        for (const target of selectedTargets) {
          // guardrail: the selection has to be a legal option on the blueprint.
          // a save can go stale when a rulebook option is renamed or dropped
          if (!this.isPermittedOption(choice.options, target)) continue;

          // a repeated pick is only spent twice if the block says it stacks
          // (half-elf's +1/+1 must land on two different abilities)
          if (!choice.allowDuplicates && applied.includes(target)) continue;

          // the block also caps how many picks it is willing to honour
          if (applied.length >= choice.chooseAmount) break;
          applied.push(target);

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
