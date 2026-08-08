import { beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterBootstrapper } from "@project/engine";
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
      runtimeEffects: null,
      runtimeResources: null,
    });

    vi.spyOn(socketService, "emitHpModification").mockImplementation(() => {});
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
    expect(state.latestRollResults).toHaveLength(1);
    expect(state.latestRollResults[0]?.target).toBe("DAMAGE_ROLL");
    expect(state.latestRollResults[0]?.total).toBeGreaterThan(0);

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
});
