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
          lore: { shortDescription: "Adds a state on hit" },
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
          lore: { shortDescription: "Produces a damage roll on hit" },
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
          lore: { shortDescription: "Rerolls a natural 1 on attacks" },
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

  // Narrowed when turn transitions moved to the server. The turn events this
  // used to assert are now dispatched by TurnLifecycle, covered in the engine
  // and again in resolvePlayerTurn's suite; a save failure is still local.
  it("dispatches the save-failure authored event through the runtime path", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_turns",
          name: "Turn Trigger",
          lore: { shortDescription: "Adds states for turn events" },
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

    store.handleSaveOutcome(false);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "save_failed",
    );

    compileSpy.mockRestore();
  });

  // The turn-start economy refresh that used to be asserted here moved to the
  // server: see resolvePlayerTurn's suite for the refresh itself, and
  // "server-owned turns" below for the sheet adopting it.
  it("spends a reaction once and tracks pending combat events", () => {
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
          lore: { shortDescription: "Adds a fresh runtime state" },
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
          lore: { shortDescription: "Creates a summon actor" },
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
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    });

    const state = useCharacterSheetStore.getState();
    expect(state.selectedActorInstanceId).toBe(actor.instanceId);
    expect(state.activeStates).toContain("actor_clockwork_toy_scuttling");
  });
});

describe("useCharacterSheetStore remote action state composition", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_remote",
      campaignId: null,
      level: 1,
      classLevels: {},
      raceId: "race_human",
      subraceId: null,
      currentHp: 10,
      maxHp: 10,
      baseHpRolled: 1,
      baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      proficiencies: {},
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: null,
      baseStates: ["status_wearing_armor"],
      activeStates: ["status_wearing_armor"],
      runtimeEffects: null,
      runtimeResources: null,
    });
  });

  it("keeps non-effect states when the server reports an executed action", () => {
    useCharacterSheetStore.getState().syncRemoteActionExecution({
      characterId: "char_remote",
      requestId: "req_1",
      actionId: "action_reckless_attack",
      source: "character",
      executed: true,
      rollResults: [],
      activeStates: ["status_reckless_attack"],
      resources: [],
      effects: [
        {
          instanceId: "effect_reckless",
          sourceName: "Reckless Attack",
          durationType: "turn_end",
          isSelfConcentration: false,
          modifiers: [],
          grantedStates: ["status_reckless_attack"],
        },
      ],
      actors: [],
      timestamp: Date.now(),
    } as never);

    const state = useCharacterSheetStore.getState();

    expect(state.activeStates).toContain("status_wearing_armor");
    expect(state.activeStates).toContain("status_reckless_attack");
  });
});

describe("useCharacterSheetStore conditions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_conditions",
      campaignId: null,
      level: 2,
      classLevels: { class_barbarian: 2 },
      raceId: "race_human",
      subraceId: null,
      currentHp: 20,
      maxHp: 20,
      baseHpRolled: 1,
      baseScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      proficiencies: {},
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: null,
      baseStates: [],
      activeConditions: [],
      activeStates: [],
      runtimeEffects: null,
      runtimeResources: null,
      combatContext: CombatContextSchema.parse({}),
      runtimeCombat: null,
    });

    vi.spyOn(socketService, "emitActionIntent").mockImplementation(() => {});
  });

  it("puts a toggled condition into the state list the calculators read", () => {
    useCharacterSheetStore.getState().toggleCondition("blinded");

    expect(useCharacterSheetStore.getState().activeConditions).toEqual([
      "blinded",
    ]);
    expect(useCharacterSheetStore.getState().activeStates).toContain("blinded");
  });

  it("clears the condition when toggled a second time", () => {
    const store = useCharacterSheetStore.getState();
    store.toggleCondition("blinded");
    useCharacterSheetStore.getState().toggleCondition("blinded");

    expect(useCharacterSheetStore.getState().activeConditions).toEqual([]);
    expect(useCharacterSheetStore.getState().activeStates).not.toContain(
      "blinded",
    );
  });

  it("holds several conditions at once", () => {
    useCharacterSheetStore.getState().toggleCondition("blinded");
    useCharacterSheetStore.getState().toggleCondition("prone");

    expect(useCharacterSheetStore.getState().activeStates).toContain("blinded");
    expect(useCharacterSheetStore.getState().activeStates).toContain("prone");
  });

  it("refuses an id that is not a known condition, so a typo cannot invent a state", () => {
    useCharacterSheetStore.getState().toggleCondition("blindd");

    expect(useCharacterSheetStore.getState().activeConditions).toEqual([]);
    expect(useCharacterSheetStore.getState().activeStates).not.toContain(
      "blindd",
    );
  });

  it("keeps conditions through a turn cycle, since they are not timed effects", () => {
    useCharacterSheetStore.getState().toggleCondition("incapacitated");

    useCharacterSheetStore.getState().endTurn();
    useCharacterSheetStore.getState().beginTurn();

    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "incapacitated",
    );
  });

  it("keeps conditions alongside states granted by an effect", () => {
    const runtimeEffects = new EffectManager();
    runtimeEffects.addEffect({
      instanceId: "effect_rage",
      sourceName: "Rage",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging"],
    });
    useCharacterSheetStore.setState({
      runtimeEffects,
      runtimeResources: new ResourceManager(),
    });

    useCharacterSheetStore.getState().toggleCondition("prone");
    useCharacterSheetStore.getState().endTurn();

    const states = useCharacterSheetStore.getState().activeStates;
    expect(states).toContain("prone");
    expect(states).toContain("status_raging");
  });
});

describe("useCharacterSheetStore server-owned turns", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_turns_remote",
      campaignId: null,
      level: 5,
      classLevels: { class_barbarian: 5 },
      raceId: "race_human",
      subraceId: null,
      currentHp: 20,
      maxHp: 20,
      baseHpRolled: 1,
      baseScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      proficiencies: {},
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: null,
      baseStates: [],
      activeConditions: [],
      activeStates: [],
      runtimeEffects: null,
      runtimeResources: null,
      combatContext: CombatContextSchema.parse({}),
      runtimeCombat: null,
    });

    vi.spyOn(socketService, "emitTurnIntent").mockImplementation(() => {});
  });

  it("asks the server to start the turn rather than deciding locally", () => {
    useCharacterSheetStore.getState().beginTurn();

    expect(socketService.emitTurnIntent).toHaveBeenCalledWith(
      "started",
      expect.objectContaining({ characterId: "char_turns_remote" }),
    );
  });

  it("asks the server to end the turn", () => {
    useCharacterSheetStore.getState().endTurn();

    expect(socketService.emitTurnIntent).toHaveBeenCalledWith(
      "ended",
      expect.objectContaining({ characterId: "char_turns_remote" }),
    );
  });

  it("does not expire effects locally, since the server owns them now", () => {
    const runtimeEffects = new EffectManager();
    runtimeEffects.addEffect({
      instanceId: "effect_reckless",
      sourceName: "Reckless Attack",
      durationType: "turn_end",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_reckless_attack"],
    });
    useCharacterSheetStore.setState({
      runtimeEffects,
      runtimeResources: new ResourceManager(),
    });

    useCharacterSheetStore.getState().endTurn();

    // a local tick here is exactly what the next server sync would undo
    expect(runtimeEffects.getActiveStates()).toContain(
      "status_reckless_attack",
    );
  });

  it("adopts the effects the server reports after a turn transition", () => {
    useCharacterSheetStore.getState().syncRemoteTurnResolution({
      characterId: "char_turns_remote",
      requestId: "req_1",
      transition: "ended",
      rollResults: [],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    } as never);

    expect(
      useCharacterSheetStore.getState().runtimeEffects?.getActiveStates(),
    ).toEqual([]);
  });

  it("adopts the refreshed economy the server reports", () => {
    useCharacterSheetStore.setState({
      combatContext: CombatContextSchema.parse({
        economy: {
          actionAvailable: false,
          bonusActionAvailable: false,
          reactionAvailable: false,
        },
      }),
    });

    useCharacterSheetStore.getState().syncRemoteTurnResolution({
      characterId: "char_turns_remote",
      requestId: "req_1",
      transition: "started",
      rollResults: [],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    } as never);

    expect(
      useCharacterSheetStore.getState().combatContext.economy.actionAvailable,
    ).toBe(true);
  });

  it("keeps player-declared conditions across a server turn sync", () => {
    useCharacterSheetStore.getState().toggleCondition("prone");

    useCharacterSheetStore.getState().syncRemoteTurnResolution({
      characterId: "char_turns_remote",
      requestId: "req_1",
      transition: "started",
      rollResults: [],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    } as never);

    expect(useCharacterSheetStore.getState().activeStates).toContain("prone");
  });
});

describe("useCharacterSheetStore standard actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_actions",
      level: 1,
      classLevels: {},
      raceId: "race_human",
      subraceId: null,
      baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      baseStates: [],
      activeConditions: [],
      activeStates: [],
      runtimeEffects: null,
      runtimeResources: null,
    });
  });

  it("offers the standard actions every character can take", () => {
    const ids = useCharacterSheetStore
      .getState()
      .getCharacterActions()
      .map((action) => action.id);

    expect(ids).toContain("action_dodge");
    expect(ids).toContain("action_dash");
  });

  it("offers each standard action only once", () => {
    const ids = useCharacterSheetStore
      .getState()
      .getCharacterActions()
      .map((action) => action.id);

    expect(ids.filter((id) => id === "action_dodge")).toHaveLength(1);
  });
});
