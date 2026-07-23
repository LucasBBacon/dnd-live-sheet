import type { ActionGrant } from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * ActionResolver handles the execution of proactive abilities, translating
 * static data blueprints into live engine state.
 */
export class ActionResolver {
  /**
   * Executes an action. In a live sheet, this is called when the user clicks
   * a spell or ability button.
   * @param action Action to be executed.
   * @param effectManager Manager injection context for effect handling.
   * @param resourceManager Manager injection context for resource handling.
   * @returns true if the action has been executed successfully.
   */
  public static execute(
    action: ActionGrant,
    effectManager: EffectManager,
    resourceManager: ResourceManager,
  ): boolean {
    // gate execution behind resource availability
    if (action.consumesResource) {
      const success = resourceManager.consume(action.consumesResource);
      if (!success) {
        console.warn(
          `Failed to execute ${action.name}: Insufficient ${action.consumesResource}`,
        );
        return false; // abort execution
      }
    }

    // route the effect to correct handler
    switch (action.effect.type) {
      case "apply_effect": {
        const blueprint = action.effect;

        // translate static blueprint into live ActiveEffect
        const newEffect: ActiveEffect = {
          instanceId: `effect_${generateId()}`,
          sourceName: blueprint.effectName || action.name,
          durationType: blueprint.durationType,
          durationRemaining: blueprint.durationRounds,
          isSelfConcentration: blueprint.isSelfConcentration,
          // deep clone modifiers to prevent mutating static dict data
          modifiers: JSON.parse(JSON.stringify(blueprint.modifiers)),
          grantedStates: [...blueprint.states],
        };

        effectManager.addEffect(newEffect);
        console.log(`Applied effect: ${newEffect.sourceName}`);
        break;
      }
      case "attack": {
        // TODO: dice rolling modal for attack
        break;
      }

      case "summon": {
        // TODO: pipeline for summons
        break;
      }

      case "damage_rider": {
        // TODO: apply damage over time effect
        break;
      }

      case "macro": {
        // TODO: multi-action events
        break;
      }

      case "save": {
        // TODO: save dice rolls
        break;
      }
    }
    return true;
  }
}
