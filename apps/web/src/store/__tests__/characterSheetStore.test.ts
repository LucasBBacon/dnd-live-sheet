import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CharacterBootstrapper,
  EffectManager,
  ResourceManager,
} from "@project/engine";
import { CombatContextSchema, type ActorInstance } from "@project/shared";
import { socketService } from "../../services/socketService";
import { useCharacterSheetStore } from "../characterSheetStore";

describe("useCharacterSheetStore hp trigger handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const baseState = useCharacterSheetStore.getState();

    useCharacterSheetStore.setState({
      ...baseState,
      id: "char_1",
      campaignId: null,
      level: 1,
      classLevels: {},
      raceId: "race_half_orc",
      subraceId: null,
      currentHp: 5,
      maxHp: 10,
      baseHpRolled: 1,
      baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      proficiencies: {},
      traits: [],
      traitGrants: [],
      inventory: [],
      inventoryError: null,
      activeModifiers: [],
      resources: [],
      ruleSnapshot: null,
      activeStates: [],
      latestRollResults: [],
      runtimeEffects: null,
      runtimeResources: null,
      combatContext: CombatContextSchema.parse({}),
      runtimeCombat: null,
    });

    vi.spyOn(socketService, "emitHpModification").mockImplementation(() => {});
    vi.spyOn(socketService, "emitActionIntent").mockImplementation(() => {});
  });

  it("drops a half-orc to one hp and records the trigger state when hp hits zero", () => {
    const store = useCharacterSheetStore.getState();

    store.applyHealthDelta(-5, "test");

    expect(useCharacterSheetStore.getState().currentHp).toBe(1);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "drop_to_one_hp",
    );
    expect(useCharacterSheetStore.getState().resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "resource_relentless_endurance",
          currentCharges: 0,
        }),
      ]),
    );
  });

  it("replays the same trigger when a remote hp update drops the character to zero", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta(-5);

    expect(useCharacterSheetStore.getState().currentHp).toBe(1);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "drop_to_one_hp",
    );
  });

  it("dispatches rest triggers through the authored runtime path", () => {
    const store = useCharacterSheetStore.getState();

    store.triggerRest("long");

    expect(useCharacterSheetStore.getState().currentHp).toBe(10);
    expect(useCharacterSheetStore.getState().activeStates).toEqual([]);
  });

  it("dispatches authored attack-hit triggers through the runtime path", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_hit",
          name: "Test Hit Trigger",
          description: "Adds a state on hit",
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [],
          criticalHitModifiers: [],
          triggers: [
            {
              listenFor: "ON_ATTACK_HIT",
              executeAction: "action_add_hit_state",
            },
          ],
          actions: [
            {
              id: "action_add_hit_state",
              name: "Add Hit State",
              activation: "special",
              effect: {
                type: "apply_effect",
                effectName: "Hit State",
                durationType: "manual",
                states: ["on_attack_hit"],
                modifiers: [],
                isSelfConcentration: false,
                requiredStates: [],
                forbiddenStates: [],
              },
            },
          ],
        },
      ]);

    const store = useCharacterSheetStore.getState();

    store.dispatchAuthoredEvent("ON_ATTACK_HIT");

    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "on_attack_hit",
    );
    compileSpy.mockRestore();
  });

  it("captures roll results from authored attack actions", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_rolls",
          name: "Roll Trigger",
          description: "Produces a damage roll on hit",
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [],
          criticalHitModifiers: [],
          triggers: [
            {
              listenFor: "ON_ATTACK_HIT",
              executeAction: "action_attack_roll",
            },
          ],
          actions: [
            {
              id: "action_attack_roll",
              name: "Attack Roll",
              activation: "special",
              effect: {
                type: "attack",
                attackType: "melee_weapon",
                attackStat: "STR",
                range: 5,
                damage: [
                  {
                    sourceName: "Test Attack",
                    baseDice: "1d6",
                    damageType: "bludgeoning",
                    scalingMode: "none",
                    levelScaling: [],
                  },
                ],
              },
            },
          ],
        },
      ]);

    const store = useCharacterSheetStore.getState();

    store.dispatchAuthoredEvent("ON_ATTACK_HIT");

    const state = useCharacterSheetStore.getState();
    expect(state.latestRollResults).toHaveLength(2);
    expect(state.latestRollResults[0]?.target).toBe("ATTACK_ROLL");
    expect(state.latestRollResults[1]?.target).toBe("DAMAGE_ROLL");
    expect(state.latestRollResults[1]?.total).toBeGreaterThan(0);

    compileSpy.mockRestore();
  });

  it("appends authored roll-result broadcasts to the latest roll log", () => {
    const store = useCharacterSheetStore.getState();

    store.recordRollResult({
      characterId: "char_1",
      rollResults: [
        {
          total: 7,
          rolls: [7],
          modifier: 0,
          target: "DAMAGE_ROLL",
          damageType: "slashing",
        },
      ],
      timestamp: Date.now(),
    });

    const state = useCharacterSheetStore.getState();
    expect(state.latestRollResults).toHaveLength(1);
    expect(state.latestRollResults[0]?.target).toBe("DAMAGE_ROLL");
    expect(state.latestRollResults[0]?.total).toBe(7);
    expect(state.latestRollResults[0]?.damageType).toBe("slashing");
  });

  it("keeps authored roll entries in a single capped log", () => {
    const store = useCharacterSheetStore.getState();

    store.recordRollResult({
      characterId: "char_1",
      rollResults: [
        {
          total: 7,
          rolls: [7],
          modifier: 0,
          target: "DAMAGE_ROLL",
          damageType: "slashing",
        },
      ],
      timestamp: Date.now(),
    });

    const state = useCharacterSheetStore.getState();
    expect(state.latestRollResults).toHaveLength(1);
    expect(state.latestRollResults[0]?.target).toBe("DAMAGE_ROLL");
  });

  it("applies authored dice rules from traits while dispatching runtime events", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.9);

    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_dice_rules",
          name: "Test Dice Rules",
          description: "Rerolls a natural 1 on attacks",
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [
            {
              target: "DAMAGE_ROLL",
              requiredStates: [],
              mutator: { type: "reroll_once", triggerOn: [1] },
            },
          ],
          criticalHitModifiers: [],
          triggers: [
            {
              listenFor: "ON_ATTACK_HIT",
              executeAction: "action_attack_dice_rules",
            },
          ],
          actions: [
            {
              id: "action_attack_dice_rules",
              name: "Attack Dice Rules",
              activation: "special",
              effect: {
                type: "attack",
                attackType: "melee_weapon",
                attackStat: "STR",
                range: 5,
                damage: [
                  {
                    sourceName: "Test Attack",
                    baseDice: "1d6",
                    damageType: "bludgeoning",
                    scalingMode: "none",
                    levelScaling: [],
                  },
                ],
              },
            },
          ],
        },
      ]);

    const store = useCharacterSheetStore.getState();
    store.dispatchAuthoredEvent("ON_ATTACK_HIT");

    const state = useCharacterSheetStore.getState();
    expect(state.latestRollResults).toHaveLength(2);
    expect(state.latestRollResults[0]?.target).toBe("ATTACK_ROLL");
    expect(state.latestRollResults[1]?.target).toBe("DAMAGE_ROLL");
    expect(state.latestRollResults[1]?.total).toBe(6);

    randomSpy.mockRestore();
    compileSpy.mockRestore();
  });

  it("dispatches turn and save-failure authored events through the runtime path", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_turns",
          name: "Turn Trigger",
          description: "Adds states for turn events",
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [],
          criticalHitModifiers: [],
          triggers: [
            {
              listenFor: "ON_START_OF_TURN",
              executeAction: "action_start_turn",
            },
            {
              listenFor: "ON_END_OF_TURN",
              executeAction: "action_end_turn",
            },
            {
              listenFor: "ON_SAVING_THROW_FAILED",
              executeAction: "action_save_failed",
            },
          ],
          actions: [
            {
              id: "action_start_turn",
              name: "Start Turn",
              activation: "special",
              effect: {
                type: "apply_effect",
                effectName: "Turn Start",
                durationType: "manual",
                states: ["turn_started"],
                modifiers: [],
                isSelfConcentration: false,
                requiredStates: [],
                forbiddenStates: [],
              },
            },
            {
              id: "action_end_turn",
              name: "End Turn",
              activation: "special",
              effect: {
                type: "apply_effect",
                effectName: "Turn End",
                durationType: "manual",
                states: ["turn_ended"],
                modifiers: [],
                isSelfConcentration: false,
                requiredStates: [],
                forbiddenStates: [],
              },
            },
            {
              id: "action_save_failed",
              name: "Save Failed",
              activation: "special",
              effect: {
                type: "apply_effect",
                effectName: "Save Failed",
                durationType: "manual",
                states: ["save_failed"],
                modifiers: [],
                isSelfConcentration: false,
                requiredStates: [],
                forbiddenStates: [],
              },
            },
          ],
        },
      ]);

    const store = useCharacterSheetStore.getState();

    store.beginTurn();
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "turn_started",
    );

    store.endTurn();
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "turn_ended",
    );

    store.handleSaveOutcome(false);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "save_failed",
    );

    compileSpy.mockRestore();
  });

  it("refreshes the player's reaction economy on turn start and tracks pending combat events", () => {
    const store = useCharacterSheetStore.getState();

    store.beginCombat();
    expect(useCharacterSheetStore.getState().combatContext.inCombat).toBe(true);

    expect(store.spendReaction("reaction_protection")).toBe(true);
    expect(store.spendReaction("reaction_shield")).toBe(false);

    store.pushCombatEvent({
      id: "evt_protection",
      type: "reaction_window_opened",
      relationship: "adjacent_ally",
      rollSnapshot: {
        id: "roll_enemy_attack",
        kind: "attack",
        relationship: "unknown",
        rawRolls: [],
        knowledge: "manual_total",
        total: 15,
        hasAdvantage: false,
        hasDisadvantage: false,
      },
    });

    let state = useCharacterSheetStore.getState();
    expect(state.combatContext.pendingEvents).toHaveLength(1);
    expect(state.combatContext.economy.reactionAvailable).toBe(false);

    store.beginTurn();

    state = useCharacterSheetStore.getState();
    expect(state.combatContext.economy.reactionAvailable).toBe(true);
    expect(state.combatContext.roundNumber).toBe(2);

    store.resolveCombatEvent("evt_protection", {
      status: "resolved",
      summary: "Protection applied",
      reactionSourceId: "trait_fs_protection",
    });

    state = useCharacterSheetStore.getState();
    expect(state.combatContext.pendingEvents).toEqual([]);
    expect(state.combatContext.recentEvents[0]).toMatchObject({
      id: "evt_protection",
      status: "resolved",
      summary: "Protection applied",
      reactionSourceId: "trait_fs_protection",
    });
  });

  it("rehydrates runtime managers from the latest save when trait grants change", () => {
    const runtimeEffects = new EffectManager();
    const runtimeResources = new ResourceManager();

    runtimeEffects.addEffect({
      instanceId: "trait_state_stale",
      sourceName: "Stale",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["stale_state"],
    });

    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_granted_state",
          name: "Granted State",
          description: "Adds a fresh runtime state",
          modifiers: { fixed: [], choices: [] },
          resources: [
            {
              id: "resource_test",
              name: "Test Resource",
              maxCharges: 1,
              resetOn: "long_rest",
            },
          ],
          diceRules: [],
          criticalHitModifiers: [],
          grantedStates: ["fresh_state"],
          triggers: [],
          actions: [],
        },
      ]);

    const nextSave = {
      attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
      classes: [{ classId: "class_fighter", level: 1, selections: {} }],
      traitSelections: {},
      hp: { current: 10, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
    };

    CharacterBootstrapper.hydrateRuntimeManagers(
      nextSave,
      runtimeEffects,
      runtimeResources,
    );

    expect(runtimeEffects.getActiveStates()).toContain("fresh_state");
    expect(runtimeEffects.getActiveStates()).not.toContain("stale_state");
    expect(runtimeResources.getRuntimeResources()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "resource_test", currentCharges: 1 }),
      ]),
    );

    compileSpy.mockRestore();
  });

  it("selects an actor and executes the actor authored action", () => {
    const runtimeEffects = new EffectManager();
    const runtimeResources = new ResourceManager();

    const actor: ActorInstance = {
      instanceId: "effect_actor:actor_clockwork_toy:0",
      templateId: "actor_clockwork_toy",
      displayLabel: "Clockwork Toy",
      controller: "player",
      lifecycleState: "active",
      currentStates: ["actor_clockwork_toy"],
      availableActions: [
        {
          id: "action_actor_clockwork_toy_scuttle",
          name: "Scuttle",
          activation: "special",
          effect: {
            type: "apply_effect",
            effectName: "Scuttle",
            durationType: "manual",
            states: ["actor_clockwork_toy_scuttling"],
            modifiers: [],
            isSelfConcentration: false,
            requiredStates: [],
            forbiddenStates: [],
          },
        },
      ],
      statusSummary: "Active Clockwork Toy",
      sourceEffectInstanceId: "effect_actor",
    };

    runtimeEffects.addActor(actor);

    useCharacterSheetStore.setState({
      runtimeEffects,
      runtimeResources,
      selectedActorInstanceId: actor.instanceId,
    });

    const store = useCharacterSheetStore.getState();
    store.executeActorAction("action_actor_clockwork_toy_scuttle");

    expect(socketService.emitActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "char_1",
        actionId: "action_actor_clockwork_toy_scuttle",
        source: "actor",
        actorInstanceId: actor.instanceId,
      }),
    );
  });

  it("executes a character summon action and creates active summon actors", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_summon",
          name: "Summon Trait",
          description: "Creates a summon actor",
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [],
          criticalHitModifiers: [],
          triggers: [],
          actions: [
            {
              id: "action_tinker_construct",
              name: "Construct Clockwork Device",
              activation: "hour",
              effect: {
                type: "summon",
                entityTemplateIds: ["actor_clockwork_toy"],
                maxActive: 3,
                durationHours: 24,
              },
            },
          ],
        },
      ]);

    const store = useCharacterSheetStore.getState();
    store.executeCharacterAction("action_tinker_construct");

    expect(socketService.emitActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: "char_1",
        actionId: "action_tinker_construct",
        source: "character",
      }),
    );

    compileSpy.mockRestore();
  });

  it("applies remote actor action execution to local runtime state", () => {
    const runtimeEffects = new EffectManager();
    const runtimeResources = new ResourceManager();

    const actor: ActorInstance = {
      instanceId: "effect_actor:actor_clockwork_toy:0",
      templateId: "actor_clockwork_toy",
      displayLabel: "Clockwork Toy",
      controller: "player",
      lifecycleState: "active",
      currentStates: ["actor_clockwork_toy"],
      availableActions: [
        {
          id: "action_actor_clockwork_toy_scuttle",
          name: "Scuttle",
          activation: "special",
          effect: {
            type: "apply_effect",
            effectName: "Scuttle",
            durationType: "manual",
            states: ["actor_clockwork_toy_scuttling"],
            modifiers: [],
            isSelfConcentration: false,
            requiredStates: [],
            forbiddenStates: [],
          },
        },
      ],
      statusSummary: "Active Clockwork Toy",
      sourceEffectInstanceId: "effect_actor",
    };

    runtimeEffects.addActor(actor);

    useCharacterSheetStore.setState({
      runtimeEffects,
      runtimeResources,
      selectedActorInstanceId: null,
    });

    const store = useCharacterSheetStore.getState();
    store.syncRemoteActionExecution({
      characterId: "char_1",
      requestId: "request_1",
      actionId: "action_actor_clockwork_toy_scuttle",
      source: "actor",
      actorInstanceId: actor.instanceId,
      executed: true,
      rollResults: [],
      activeStates: ["actor_clockwork_toy", "actor_clockwork_toy_scuttling"],
      resources: [],
      effects: [
        {
          instanceId: "effect_actor",
          sourceName: "Scuttle",
          durationType: "manual",
          isSelfConcentration: false,
          modifiers: [],
          grantedStates: ["actor_clockwork_toy_scuttling"],
          kind: "effect",
        },
      ],
      actors: [
        {
          ...actor,
          currentStates: [
            "actor_clockwork_toy",
            "actor_clockwork_toy_scuttling",
          ],
        },
      ],
      timestamp: Date.now(),
    });

    const state = useCharacterSheetStore.getState();
    expect(state.selectedActorInstanceId).toBe(actor.instanceId);
    expect(state.activeStates).toContain("actor_clockwork_toy_scuttling");
  });
});
