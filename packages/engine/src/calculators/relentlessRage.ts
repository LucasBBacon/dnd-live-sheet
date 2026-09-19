import type { ActionGrant } from "@project/shared";
import { resolveSelfSaveDc } from "./saveDc.js";
import { predicateHolds } from "./tableRules.js";

export const RELENTLESS_RAGE_ACTION_ID = "action_relentless_rage";

/**
 * Full names for the save line. The only other map lives inside
 * SavingThrowsWidget, which the engine cannot import.
 */
const ABILITY_NAME: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

export interface RelentlessRageInput {
  currentHp: number;
  activeStates: string[];
  /** The trait's action. Its effect must be the self_save. */
  action: ActionGrant;
  /** How many times the save has been made since its pool last reset. */
  usesSinceRest: number;
}

export interface RelentlessRageReport {
  /** At 0 hit points with the action's own gate holding: the moment the save exists for. */
  available: boolean;
  dc: number;
  summary: string;
}

/**
 * Relentless Rage for the Rules panel.
 *
 * A reporter beside SurpriseEngine: it says when the save is on offer and at
 * what DC, and applies nothing. The 0 hit point trigger is the one thing it
 * knows that the data cannot say; the raging gate is read from the action, so
 * it is whatever the pack authored. The server resolves the action at any hit
 * points if asked - availability is reported, not enforced.
 */
export class RelentlessRageEngine {
  public static describe({
    currentHp,
    activeStates,
    action,
    usesSinceRest,
  }: RelentlessRageInput): RelentlessRageReport {
    const { effect } = action;
    if (effect.type !== "self_save") {
      throw new Error(`${action.id} is not a self_save action`);
    }

    const dc = resolveSelfSaveDc(effect.dcRule, usesSinceRest);
    const ability = ABILITY_NAME[effect.ability] ?? effect.ability;

    return {
      available: currentHp <= 0 && predicateHolds(effect, activeStates),
      dc,
      summary: `Drop to 0 hit points while raging: DC ${dc} ${ability} saving throw to drop to 1 instead.`,
    };
  }
}
