import {
  CharacterBootstrapper,
  TurnLifecycle,
  type CombatContextManager,
  type EffectManager,
  type ResourceManager,
} from "@project/engine";
import type {
  CharacterSave,
  RuntimeEffectSyncPayload,
  TurnResolvedPayload,
} from "@project/shared";

/**
 * The authoritative per-character state a turn transition touches.
 *
 * Named separately from the socket gateway's runtime so this stays testable
 * without a socket, a database, or a live character.
 */
export interface TurnRuntime {
  save: CharacterSave;
  effectManager: EffectManager;
  resourceManager: ResourceManager;
  combatContext: CombatContextManager;
}

const toEffectPayload = (
  effectManager: EffectManager,
): RuntimeEffectSyncPayload[] =>
  effectManager.getActiveEffects().map((effect) => ({
    instanceId: effect.instanceId,
    sourceName: effect.sourceName,
    durationType: effect.durationType,
    ...(effect.durationRemaining !== undefined && {
      durationRemaining: effect.durationRemaining,
    }),
    isSelfConcentration: effect.isSelfConcentration,
    modifiers: effect.modifiers,
    grantedStates: effect.grantedStates,
    ...(effect.kind !== undefined && { kind: effect.kind }),
    ...(effect.durationHours !== undefined && {
      durationHours: effect.durationHours,
    }),
    ...(effect.summonEntities !== undefined && {
      summonEntities: effect.summonEntities,
    }),
  }));

/**
 * Applies a turn transition to the server's own state and describes the result.
 *
 * The server owns turn state for the same reason it owns effects and
 * resources: whoever expires an effect has to be whoever the sheet syncs from,
 * or the next sync puts the expired effect back.
 *
 * Mutates the runtime deliberately - the caller holds it across socket calls.
 * @param runtime The authoritative managers for this character
 * @param transition Whether the turn is beginning or ending
 * @param identity The character and request this reply belongs to
 * @returns The state the sheet should adopt
 */
export const resolvePlayerTurn = (
  runtime: TurnRuntime,
  transition: "started" | "ended",
  identity: { characterId: string; requestId: string },
): TurnResolvedPayload => {
  const activeTraits = CharacterBootstrapper.compileActiveTraits(runtime.save);

  const context = {
    effectManager: runtime.effectManager,
    resourceManager: runtime.resourceManager,
    combatContext: runtime.combatContext,
    triggerGrants: activeTraits.flatMap((trait) => trait.triggers ?? []),
    actionLookup: Object.fromEntries(
      activeTraits.flatMap((trait) =>
        (trait.actions ?? []).map((action) => [action.id, action]),
      ),
    ),
    diceRules: activeTraits.flatMap((trait) => trait.diceRules ?? []),
  };

  const outcome =
    transition === "started"
      ? TurnLifecycle.beginPlayerTurn(context)
      : TurnLifecycle.endPlayerTurn(context);

  return {
    characterId: identity.characterId,
    requestId: identity.requestId,
    transition,
    rollResults: outcome.rollResults.map((result) => ({
      total: result.total,
      rolls: result.rolls,
      modifier: result.modifier,
      target: result.target,
      ...(result.damageType !== undefined && { damageType: result.damageType }),
      ...(result.label !== undefined && { label: result.label }),
      ...(result.summary !== undefined && { summary: result.summary }),
    })),
    activeStates: runtime.effectManager.getActiveStates(),
    resources: runtime.resourceManager.getRuntimeResources().map((resource) => ({
      id: resource.id,
      current: resource.currentCharges,
      currentCharges: resource.currentCharges,
    })),
    effects: toEffectPayload(runtime.effectManager),
    actors: runtime.effectManager.getActiveActors(),
    combatContext: outcome.combatContext,
    timestamp: Date.now(),
  };
};
