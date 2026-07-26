import type { ActionGrant, SpellDefinition } from "@project/shared";
import type { RuntimeSpellSource } from "../types/spells.js";
import type { Ability } from "../types/core.js";

export class SpellbookEngine {
  /**
   * Evaluates all of a character's Spell Sources and returns a flattened array
   * of executable ActionGrants ready for UI.
   * @param sources The character's array of RuntimeSpellSources
   * @param spellDictionary The global static dictionary of all spells
   * @returns An array of ActionGrants representing all currently castable spells for the character
   */
  public static getCastableSpells(
    sources: RuntimeSpellSource[],
    spellDictionary: Record<string, SpellDefinition>,
  ): ActionGrant[] {
    const castableActions: ActionGrant[] = [];

    for (const source of sources) {
      // determine which spell ids from this source are currently castable
      let activeIds: string[] = [];

      if (
        source.preparationMode === "known" ||
        source.preparationMode === "innate"
      ) {
        activeIds = source.knownSpellIds;
      } else {
        // prepared or full_list
        activeIds = source.preparedSpellIds;
      }

      for (const spellId of activeIds) {
        const spellDef = spellDictionary[spellId];
        if (!spellDef) {
          console.warn(`Spell ID ${spellId} not found in dictionary.`);
          continue;
        }

        // deep clone the action so it can be mutated it safely for thi specific source
        const synthesizedAction: ActionGrant = JSON.parse(
          JSON.stringify(spellDef.action),
        );

        // 1 - tag the action with the source for UI categorization
        synthesizedAction.id = `${source.sourceId}_${spellDef.id}`;

        // 2 - inject the governing stat (MULTICLASSING!!)
        // the engine needs to dynamically replace "spellcasting_mod" in the static
        // ActionGrant with actual stat (e.g., "INT" or "CHA")
        this.injectGoverningStat(synthesizedAction, source.governingStat);

        castableActions.push(synthesizedAction);
      }
    }

    return castableActions;
  }

  /**
   * Recursively crawls an ActionGrant effect payload and replaces the abstract
   * "SPELLCASTING_MOD" with the actual governing stat for this source.
   * @param action The ActionGrant to process
   * @param stat The governing Ability to inject
   */
  private static injectGoverningStat(action: ActionGrant, stat: Ability): void {
    this.applyGoverningStat(action.effect, stat);
  }

  /**
   * Recursively crawls an ActionGrant effect payload and replaces the abstract
   * "SPELLCASTING_MOD" with the actual governing stat for this source.
   * @param effect The ActionGrant effect payload to process
   * @param stat The governing Ability to inject
   */
  private static applyGoverningStat(
    effect: ActionGrant["effect"],
    stat: Ability,
  ): void {
    if (
      effect.type === "save" &&
      effect.savingThrow.dcCalculation.scalingStat === "SPELLCASTING_MOD"
    ) {
      effect.savingThrow.dcCalculation.scalingStat = stat;
    }

    if (effect.type === "attack" && effect.attackStat === "SPELLCASTING_MOD") {
      effect.attackStat = stat;
    }

    if (effect.type === "macro") {
      for (const subEffect of effect.effects) {
        this.applyGoverningStat(subEffect, stat);
      }
    }
  }

  /**
   * Prepares a spell, strictly enforcing the character's daily preparation limit.
   * @param source The RuntimeSpellSource to prepare the spell for
   * @param spellId The ID of the spell to prepare
   * @returns True if the spell was successfully prepared, false otherwise
   */
  public static prepareSpell(
    source: RuntimeSpellSource,
    spellId: string,
  ): boolean {
    if (
      source.preparationMode === "known" ||
      source.preparationMode === "innate"
    ) {
      return false; // these mods do not prepare spells!
    }

    if (source.preparedSpellIds.includes(spellId)) {
      return true; // already prepared
    }

    // if its a wizard, they MUST know the spell to prepare it
    if (
      source.preparationMode === "prepared" &&
      !source.knownSpellIds.includes(spellId)
    ) {
      console.warn(`Cannot prepare ${spellId}: Not in spellbook.`);
      return false;
    }

    source.preparedSpellIds.push(spellId);
    return true;
  }
}
