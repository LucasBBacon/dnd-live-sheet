import type { ActionGrant } from "@project/shared";
import type { ActiveEffect, EffectManager } from "../calculators/effects.js";

const generateId = () => Math.random().toString(36).substring(2, 9);

export class ActionResolver {
  public static execute(
    action: ActionGrant,
    effectManager: EffectManager,
  ): void {
    // TODO: handle resource consumption here
    // if (action.consumesResource) {
    //   deductResource(action.consumesResource);
    // }

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
  }
}
