import type { ActionGrant } from "./schemas/actions.js";

/**
 * The actions any character can take on their turn, from the 2014 PHB.
 *
 * Vocabulary rather than authored content, so they live here beside SKILL_MAP
 * and CONDITION_MAP: a rulebook adds traits and spells, but the set of actions
 * the engine understands is part of the engine.
 *
 * Each one carries an effect only where something actually consumes it - a
 * calculator or a specific piece of UI. The rest declare `no_effect` and simply
 * cost the action; which action was spent is already recorded on the economy as
 * `spentActionSourceId`, so there is no need to mint states nobody reads.
 *
 * Attack is deliberately absent. It is not a fixed grant: it is taken
 * implicitly by swinging a weapon, and its allowance is sized by
 * ATTACKS_PER_ACTION - see ActionResolver.settleAttack.
 */
export const STANDARD_ACTIONS: ActionGrant[] = [
  {
    id: "action_dash",
    name: "Dash",
    activation: "action",
    effect: {
      type: "apply_effect",
      effectName: "Dash",
      effectTag: "dash",
      durationType: "turn_end",
      isSelfConcentration: false,
      requiredStates: [],
      forbiddenStates: [],
      states: ["status_dashing"],
      modifiers: [
        {
          // SpeedEngine applies multipliers after encumbrance, so this doubles
          // the speed the character can actually manage rather than their
          // unencumbered maximum
          target: "SPEED",
          type: "multiplier",
          value: 2,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
    },
  },
  {
    id: "action_disengage",
    name: "Disengage",
    activation: "action",
    effect: { type: "no_effect" },
  },
  {
    id: "action_dodge",
    name: "Dodge",
    activation: "action",
    effect: {
      type: "apply_effect",
      effectName: "Dodge",
      effectTag: "dodge",
      durationType: "turn_start",
      isSelfConcentration: false,
      requiredStates: [],
      forbiddenStates: [],
      states: ["status_dodging", "status_attacks_against_have_disadvantage"],
      modifiers: [
        {
          target: "DEX_SAVE",
          type: "advantage",
          value: 0,
          scalingFactor: "none",
          requiredStates: [],
          forbiddenStates: [],
        },
      ],
    },
  },
  {
    id: "action_help",
    name: "Help",
    activation: "action",
    effect: { type: "no_effect" },
  },
  {
    id: "action_hide",
    name: "Hide",
    activation: "action",
    effect: {
      type: "apply_effect",
      effectName: "Hidden",
      effectTag: "hidden",
      // you stay hidden until you are found, which no turn boundary knows about
      durationType: "manual",
      isSelfConcentration: false,
      requiredStates: [],
      forbiddenStates: [],
      states: ["status_hidden"],
      modifiers: [],
    },
  },
  {
    id: "action_end_hiding",
    name: "Stop Hiding",
    activation: "special",
    effect: { type: "remove_effect", effectTag: "hidden" },
  },
  {
    id: "action_ready",
    name: "Ready",
    activation: "action",
    effect: { type: "no_effect" },
  },
  {
    id: "action_search",
    name: "Search",
    activation: "action",
    effect: { type: "no_effect" },
  },
  {
    id: "action_use_object",
    name: "Use an Object",
    activation: "action",
    effect: { type: "no_effect" },
  },
];

/** Stable order for the actions panel. */
export const STANDARD_ACTION_IDS: string[] = STANDARD_ACTIONS.map(
  (action) => action.id,
);
