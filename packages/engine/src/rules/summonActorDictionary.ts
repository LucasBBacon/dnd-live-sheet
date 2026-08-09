import type { ActionGrant, ActorBlueprint, ActorInstance } from "@project/shared";

const makeIdleAction = (
  id: string,
  name: string,
  effectName: string,
  stateId: string,
): ActionGrant => ({
  id,
  name,
  activation: "special",
  effect: {
    type: "apply_effect",
    effectName,
    durationType: "manual",
    states: [stateId],
    modifiers: [],
    isSelfConcentration: false,
    requiredStates: [],
    forbiddenStates: [],
  },
});

export const SUMMON_ACTOR_DICTIONARY: Record<string, ActorBlueprint> = {
  actor_clockwork_toy: {
    id: "actor_clockwork_toy",
    label: "Clockwork Toy",
    baseStates: ["actor_clockwork_toy"],
    authoredActions: [
      makeIdleAction(
        "action_actor_clockwork_toy_scuttle",
        "Scuttle",
        "Scuttle",
        "actor_clockwork_toy_scuttling",
      ),
    ],
    combatProfile: {
      armourClass: 5,
      hitPoints: 1,
      speed: 5,
      size: "tiny",
    },
    controllerRules: {
      defaultController: "player",
      playerControlled: true,
    },
  },
  actor_fire_starter: {
    id: "actor_fire_starter",
    label: "Fire Starter",
    baseStates: ["actor_fire_starter"],
    authoredActions: [
      makeIdleAction(
        "action_actor_fire_starter_ignite",
        "Ignite Flame",
        "Ignite Flame",
        "actor_fire_starter_lit",
      ),
    ],
    combatProfile: {
      armourClass: 5,
      hitPoints: 1,
      speed: 0,
      size: "tiny",
    },
    controllerRules: {
      defaultController: "player",
      playerControlled: true,
    },
  },
  actor_music_box: {
    id: "actor_music_box",
    label: "Music Box",
    baseStates: ["actor_music_box"],
    authoredActions: [
      makeIdleAction(
        "action_actor_music_box_play",
        "Play Song",
        "Play Song",
        "actor_music_box_playing",
      ),
    ],
    combatProfile: {
      armourClass: 5,
      hitPoints: 1,
      speed: 0,
      size: "tiny",
    },
    controllerRules: {
      defaultController: "player",
      playerControlled: true,
    },
  },
};

export const resolveSummonActorBlueprint = (
  templateId: string,
): ActorBlueprint | undefined => SUMMON_ACTOR_DICTIONARY[templateId];

export const createSummonActorInstances = (
  sourceEffectInstanceId: string,
  ownerCharacterId: string | undefined,
  templateIds: string[],
): ActorInstance[] =>
  templateIds.map((templateId, index) => {
    const blueprint = resolveSummonActorBlueprint(templateId);

    return {
      instanceId: `${sourceEffectInstanceId}:${templateId}:${index}`,
      ownerCharacterId,
      templateId,
      displayLabel: blueprint?.label ?? templateId,
      controller: blueprint?.controllerRules.defaultController ?? "player",
      lifecycleState: "active",
      currentStates: [...(blueprint?.baseStates ?? [templateId])],
      availableActions: blueprint?.authoredActions ?? [],
      combatProfile: blueprint?.combatProfile,
      statusSummary: blueprint
        ? `Active ${blueprint.label}`
        : `Active summon from ${templateId}`,
      sourceEffectInstanceId,
    };
  });