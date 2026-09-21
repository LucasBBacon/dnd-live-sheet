import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CharacterBootstrapper,
  EffectManager,
  ResourceManager,
} from "@project/engine";
import { CombatContextSchema, type ActorInstance } from "@project/shared";
import { socketService } from "../../services/socketService";
import { useCharacterSheetStore } from "../characterSheetStore";
import { packRuleSnapshot } from "./packFixture";

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
      traits: [],
      traitGrants: [],
      inventory: [],
      inventoryError: null,
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
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

    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: -5,
      source: "test",
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(1);
    expect(useCharacterSheetStore.getState().activeStates).toContain(
      "drop_to_one_hp",
    );
  });

  it("ignores an hp update addressed to another character, so another player's heal or damage cannot change this sheet's hp", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta({
      characterId: "char_other",
      delta: 100,
      source: "test",
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(5);
  });

  it("applies an hp update addressed to this character", () => {
    const store = useCharacterSheetStore.getState();

    store.syncRemoteHealthDelta({
      characterId: "char_1",
      delta: 3,
      source: "test",
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().currentHp).toBe(8);
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
              maxRule: { kind: "fixed", value: 1 },
              resetCondition: "long_rest",
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
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
      baseStates: ["status_wearing_armor"],
      activeStates: ["status_wearing_armor"],
      latestRollResults: [],
      latestNotes: [],
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

  it("ignores an action resolution for a different character, so another player's sheet cannot paint into this one", () => {
    useCharacterSheetStore.getState().recordRollResult({
      characterId: "char_remote",
      rollResults: [
        {
          total: 12,
          rolls: [12],
          modifier: 0,
          target: "ATTACK_ROLL",
        },
      ],
      timestamp: Date.now(),
    });

    const before = useCharacterSheetStore.getState();
    expect(before.latestRollResults).toHaveLength(1);

    // ACTION_RESOLVED broadcasts to the whole campaign room. This resolution
    // belongs to another character's caltrops: no roll, a table note. Landing
    // on this sheet would wipe latestRollResults to [] and paint the caltrops
    // note into a panel about a rule this character's player never triggered.
    useCharacterSheetStore.getState().syncRemoteActionExecution({
      characterId: "char_other",
      requestId: "req_other",
      actionId: "action_item_caltrops_scatter",
      source: "item",
      instanceId: "inv_caltrops",
      executed: true,
      rollResults: [],
      notes: [
        "Any creature entering the area must succeed on a DC 15 Dexterity saving throw or stop moving and take 1 piercing damage.",
      ],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      timestamp: Date.now(),
    } as never);

    const after = useCharacterSheetStore.getState();
    expect(after.latestRollResults).toEqual(before.latestRollResults);
    expect(after.latestNotes).toEqual([]);
    expect(after.activeStates).toEqual(before.activeStates);
  });

  it("clears a resolved action's notes once an unrelated roll arrives, so a stale note cannot sit beside it", () => {
    useCharacterSheetStore.getState().syncRemoteActionExecution({
      characterId: "char_remote",
      requestId: "req_caltrops",
      actionId: "action_item_caltrops_scatter",
      source: "item",
      instanceId: "inv_caltrops",
      executed: true,
      rollResults: [],
      notes: [
        "Any creature entering the area must succeed on a DC 15 Dexterity saving throw or stop moving and take 1 piercing damage.",
      ],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      timestamp: Date.now(),
    } as never);

    expect(useCharacterSheetStore.getState().latestNotes).toHaveLength(1);

    // an unrelated roll - a saving throw, nothing to do with the caltrops
    // that were just scattered a moment ago
    useCharacterSheetStore.getState().recordRollResult({
      characterId: "char_remote",
      rollResults: [
        {
          total: 14,
          rolls: [14],
          modifier: 0,
          target: "SAVING_THROW",
        },
      ],
      timestamp: Date.now(),
    });

    const state = useCharacterSheetStore.getState();

    expect(state.latestRollResults).toHaveLength(1);
    expect(state.latestRollResults[0]?.target).toBe("SAVING_THROW");
    expect(state.latestNotes).toEqual([]);
  });

  it("clears a stale roll when a note-bearing action rolls nothing, so the two never describe different actions", () => {
    useCharacterSheetStore.getState().recordRollResult({
      characterId: "char_remote",
      rollResults: [
        {
          total: 17,
          rolls: [17],
          modifier: 0,
          target: "ATTACK_ROLL",
        },
      ],
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().latestRollResults).toHaveLength(1);

    // caltrops: no_effect, rolls nothing, leaves a table note - the earlier
    // attack roll above has nothing to do with this action
    useCharacterSheetStore.getState().syncRemoteActionExecution({
      characterId: "char_remote",
      requestId: "req_caltrops_reverse",
      actionId: "action_item_caltrops_scatter",
      source: "item",
      instanceId: "inv_caltrops",
      executed: true,
      rollResults: [],
      notes: [
        "Any creature entering the area must succeed on a DC 15 Dexterity saving throw or stop moving and take 1 piercing damage.",
      ],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      timestamp: Date.now(),
    } as never);

    const reverseState = useCharacterSheetStore.getState();

    expect(reverseState.latestRollResults).toEqual([]);
    expect(reverseState.latestNotes).toHaveLength(1);
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
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
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
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
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


/**
 * Surprise is server-authoritative, like effects, resources and the economy:
 * the player declares it, the server records it, and every client on the
 * character mirrors what comes back. The sheet never sets it locally, because
 * a local guess would be overwritten by the next broadcast anyway.
 */
describe("useCharacterSheetStore surprise", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_surprise",
      baseStates: [],
      activeConditions: [],
      combatContext: CombatContextSchema.parse({}),
      runtimeCombat: null,
      runtimeEffects: null,
      runtimeResources: null,
    });

    vi.spyOn(socketService, "emitTurnIntent").mockImplementation(() => {});
  });

  it("starts a character unsurprised", () => {
    expect(useCharacterSheetStore.getState().combatContext.surprised).toBe(
      false,
    );
  });

  it("asks the server to record the declaration", () => {
    const emit = vi
      .spyOn(socketService, "emitSurpriseDeclared")
      .mockImplementation(() => {});

    useCharacterSheetStore.getState().setSurprised(true);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "char_surprise", surprised: true }),
    );
  });

  it("does not set the flag locally, since the server owns it", () => {
    vi.spyOn(socketService, "emitSurpriseDeclared").mockImplementation(() => {});

    useCharacterSheetStore.getState().setSurprised(true);

    expect(useCharacterSheetStore.getState().combatContext.surprised).toBe(
      false,
    );
  });

  it("adopts the declaration the server broadcasts", () => {
    useCharacterSheetStore.getState().syncRemoteSurprise({
      characterId: "char_surprise",
      combatContext: CombatContextSchema.parse({ surprised: true }),
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().combatContext.surprised).toBe(true);
  });

  it("adopts a broadcast that takes the declaration back", () => {
    useCharacterSheetStore.getState().syncRemoteSurprise({
      characterId: "char_surprise",
      combatContext: CombatContextSchema.parse({ surprised: true }),
      timestamp: Date.now(),
    });
    useCharacterSheetStore.getState().syncRemoteSurprise({
      characterId: "char_surprise",
      combatContext: CombatContextSchema.parse({ surprised: false }),
      timestamp: Date.now(),
    });

    expect(useCharacterSheetStore.getState().combatContext.surprised).toBe(
      false,
    );
  });

  it("takes the server's turn state wholesale, surprise included", () => {
    useCharacterSheetStore.getState().syncRemoteSurprise({
      characterId: "char_surprise",
      combatContext: CombatContextSchema.parse({ surprised: true }),
      timestamp: Date.now(),
    });

    // the server retires surprise when the player's turn ends, so the sync
    // must not preserve the local copy over it
    useCharacterSheetStore.getState().syncRemoteTurnResolution({
      characterId: "char_surprise",
      requestId: "req_1",
      rollResults: [],
      activeStates: [],
      resources: [],
      effects: [],
      actors: [],
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    } as never);

    expect(useCharacterSheetStore.getState().combatContext.surprised).toBe(
      false,
    );
  });
});

describe("initialize materialises trait-granted pools", () => {
  it("adds Rage for a barbarian whose payload carried no resources", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      raceId: "race_human",
      subraceId: null,
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
    });

    expect(useCharacterSheetStore.getState().resources).toContainEqual(
      expect.objectContaining({ id: "resource_barbarian_rage", current: 3 }),
    );
  });

  it("keeps a pool the payload already carried, without duplicating it", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      raceId: "race_human",
      subraceId: null,
      resources: [{ id: "resource_barbarian_rage", current: 1 }],
      ruleSnapshot: packRuleSnapshot(),
    });

    const rage = useCharacterSheetStore
      .getState()
      .resources.filter((resource) => resource.id === "resource_barbarian_rage");
    expect(rage).toHaveLength(1);
    expect(rage[0]?.current).toBe(1);
  });
});

describe("getActiveTraits with a subclass", () => {
  it("compiles the chosen totem from the class ledger and the player's choice", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 3,
      classLevels: { class_barbarian: 3 },
      subclassIds: { class_barbarian: "subclass_barbarian_totem_warrior" },
      traitGrants: [
        { id: "grant_1", traitId: "trait_totem_spirit_bear", source: "player_choice" },
      ],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });

    const ids = useCharacterSheetStore
      .getState()
      .getActiveTraits()
      .map((trait) => trait.id);

    expect(ids).toContain("trait_spirit_seeker");
    expect(ids).toContain("trait_totem_spirit_bear");
    expect(ids).not.toContain("trait_totem_spirit_eagle");
  });
});

describe("getCharacterActions and dynamic templates", () => {
  it("leaves the Berserker's swing templates to the attack cards", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 14,
      classLevels: { class_barbarian: 14 },
      subclassIds: { class_barbarian: "subclass_barbarian_berserker" },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });

    const ids = useCharacterSheetStore
      .getState()
      .getCharacterActions()
      .map((action) => action.id);

    expect(ids).toContain("action_frenzied_rage");
    expect(ids).not.toContain("action_frenzied_strike");
    expect(ids).not.toContain("action_retaliation");
  });
});

describe("getSuspendedConditions", () => {
  const raging = () => {
    const effects = new EffectManager();
    effects.addEffect({
      instanceId: "rage",
      sourceName: "Rage",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_raging"],
    });
    return effects;
  };

  const frightenedBerserker = (runtimeEffects: EffectManager) =>
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 6,
      classLevels: { class_barbarian: 6 },
      subclassIds: { class_barbarian: "subclass_barbarian_berserker" },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
      activeConditions: ["frightened"],
      baseStates: [],
      runtimeEffects,
    });

  it("suspends frightened while a Mindless Rage berserker rages", () => {
    frightenedBerserker(raging());

    expect(useCharacterSheetStore.getState().getSuspendedConditions()).toEqual([
      {
        condition: "frightened",
        source: packRuleSnapshot().traitsById?.["trait_berserker_mindless_rage"]?.name,
      },
    ]);
  });

  it("suspends nothing while the berserker is not raging", () => {
    frightenedBerserker(new EffectManager());

    expect(useCharacterSheetStore.getState().getSuspendedConditions()).toEqual([]);
  });
});

describe("getCharacterActions and self-saves", () => {
  it("leaves Relentless Rage to the Rules panel", () => {
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 11,
      classLevels: { class_barbarian: 11 },
      subclassIds: { class_barbarian: null },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      ruleSnapshot: packRuleSnapshot(),
    });
    const state = useCharacterSheetStore.getState();

    expect(
      state.getActiveTraits().flatMap((trait) => trait.actions.map((action) => action.id)),
    ).toContain("action_relentless_rage");
    expect(state.getCharacterActions().map((action) => action.id)).not.toContain(
      "action_relentless_rage",
    );
  });

  it("keeps any other self-save in the list, since the Rules panel offers only Relentless Rage's", () => {
    const compileSpy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([
        {
          id: "trait_test_brace",
          name: "Brace",
          lore: { shortDescription: "A self-save no panel surfaces" },
          modifiers: { fixed: [], choices: [] },
          resources: [],
          diceRules: [],
          criticalHitModifiers: [],
          triggers: [],
          actions: [
            {
              id: "action_test_brace",
              name: "Brace",
              activation: "reaction",
              effect: {
                type: "self_save",
                ability: "CON",
                dcRule: { kind: "fixed", value: 10 },
                requiredStates: [],
                forbiddenStates: [],
              },
            },
          ],
        },
      ]);

    expect(
      useCharacterSheetStore
        .getState()
        .getCharacterActions()
        .map((action) => action.id),
    ).toContain("action_test_brace");

    compileSpy.mockRestore();
  });
});

describe("the store's resource counts survive runtime hydration", () => {
  // Level 11: Rage has 4 charges and Relentless Rage is on the sheet. The
  // counts are what the server sent, and nothing below should move them
  // except a rest or the server's own resolution.
  const RAGE = "resource_barbarian_rage";
  const RELENTLESS = "resource_relentless_rage";

  const countOf = (id: string) =>
    useCharacterSheetStore
      .getState()
      .resources.find((resource) => resource.id === id)?.current;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(socketService, "emitHpModification").mockImplementation(() => {});
    vi.spyOn(socketService, "emitRestCompleted").mockImplementation(() => {});
    vi.spyOn(socketService, "emitRollResults").mockImplementation(() => {});

    useCharacterSheetStore.setState({
      runtimeEffects: null,
      runtimeResources: null,
      activeConditions: [],
      baseStates: [],
    });
    useCharacterSheetStore.getState().initialize({
      id: "char_1",
      level: 11,
      classLevels: { class_barbarian: 11 },
      subclassIds: { class_barbarian: null },
      traitGrants: [],
      raceId: "race_human",
      subraceId: null,
      currentHp: 30,
      maxHp: 100,
      resources: [
        { id: RAGE, current: 1 },
        { id: RELENTLESS, current: 1 },
      ],
      ruleSnapshot: packRuleSnapshot(),
    });
  });

  it("keeps a uses count through an hp change", () => {
    useCharacterSheetStore.getState().applyHealthDelta(-5, "test");

    expect(useCharacterSheetStore.getState().currentHp).toBe(25);
    expect(countOf(RELENTLESS)).toBe(1);
  });

  it("keeps a spent charges pool through an hp change", () => {
    useCharacterSheetStore.getState().applyHealthDelta(-5, "test");

    expect(countOf(RAGE)).toBe(1);
  });

  it("keeps both counts through an authored event", () => {
    useCharacterSheetStore.getState().dispatchAuthoredEvent("ON_ATTACK_HIT");

    expect(countOf(RAGE)).toBe(1);
    expect(countOf(RELENTLESS)).toBe(1);
  });

  it("keeps a count the server resolved through the next hp change", () => {
    useCharacterSheetStore.getState().syncRemoteActionExecution({
      characterId: "char_1",
      requestId: "req_relentless",
      actionId: "action_relentless_rage",
      source: "character",
      executed: true,
      rollResults: [],
      activeStates: [],
      resources: [
        { id: RAGE, current: 1, currentCharges: 1 },
        { id: RELENTLESS, current: 2, currentCharges: 2 },
      ],
      effects: [],
      actors: [],
      combatContext: CombatContextSchema.parse({}),
      timestamp: Date.now(),
    });
    useCharacterSheetStore.getState().applyHealthDelta(-5, "test");

    expect(countOf(RAGE)).toBe(1);
    expect(countOf(RELENTLESS)).toBe(2);
  });

  it("resets only the short-rest pool on a short rest", () => {
    useCharacterSheetStore.getState().triggerRest("short");

    expect(countOf(RAGE)).toBe(1);
    expect(countOf(RELENTLESS)).toBe(0);
  });

  it("still resets both pools on a long rest", () => {
    useCharacterSheetStore.getState().triggerRest("long");

    expect(countOf(RAGE)).toBe(4);
    expect(countOf(RELENTLESS)).toBe(0);
  });

  it("keeps a pack-level pool the traits do not carry through an hp change", () => {
    useCharacterSheetStore.getState().initialize({
      classLevels: { class_fighter: 2 },
      subclassIds: { class_fighter: null },
      level: 2,
      resources: [{ id: "trait_action_surge", current: 0 }],
    });

    useCharacterSheetStore.getState().applyHealthDelta(-5, "test");

    expect(countOf("trait_action_surge")).toBe(0);
  });
});

describe("useCharacterSheetStore proficiency grants", () => {
  beforeEach(() => {
    const baseState = useCharacterSheetStore.getState();

    useCharacterSheetStore.setState({
      ...baseState,
      id: "char_prof",
      campaignId: null,
      level: 1,
      classLevels: { class_barbarian: 1 },
      subclassIds: {},
      raceId: "race_human",
      subraceId: null,
      currentHp: 12,
      maxHp: 12,
      baseHpRolled: 12,
      baseScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      traits: [],
      traitGrants: [],
      inventory: [],
      activeModifiers: [],
      resources: [],
      ruleSnapshot: packRuleSnapshot(),
      activeStates: [],
    });
  });

  it("derives proficiency grants from the character's active traits", () => {
    // a level 1 barbarian: trait_barbarian_prof_weapons grants both weapon
    // categories, trait_barbarian_prof_armor grants light, medium and shields,
    // trait_barbarian_prof_saving_throw grants STR and CON
    const grants = useCharacterSheetStore.getState().getProficiencyGrants();
    const idsIn = (category: string) =>
      grants
        .filter((grant) => grant.category === category)
        .map((grant) => grant.proficiencyId);

    expect(idsIn("weapons")).toEqual(
      expect.arrayContaining([
        "category_weapon_simple",
        "category_weapon_martial",
      ]),
    );
    expect(idsIn("armor")).toEqual(
      expect.arrayContaining(["category_armor_shield"]),
    );
    expect(idsIn("saving_throws")).toEqual(
      expect.arrayContaining(["STR", "CON"]),
    );
  });

  it("includes the fixed grants of the character's background", () => {
    useCharacterSheetStore.setState({ backgroundId: "background_criminal" });

    const skills = useCharacterSheetStore
      .getState()
      .getProficiencyGrants()
      .filter((grant) => grant.category === "skills")
      .map((grant) => grant.proficiencyId);

    expect(skills).toEqual(expect.arrayContaining(["deception", "stealth"]));
  });
});
