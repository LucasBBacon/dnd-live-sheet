import { describe, expect, it } from "vitest";
import {
  ActionActivationSchema,
  ActionGrantSchema,
  costsAttack,
  costsCombatEconomy,
  isDowntime,
  isFree,
  type ActionActivation,
} from "../actions.js";

const ALL_ACTIVATIONS = ActionActivationSchema.options as ActionActivation[];

describe("ActionActivationSchema", () => {
  it("accepts an attack, which draws on the Attack action rather than costing one", () => {
    expect(ActionActivationSchema.parse("attack")).toBe("attack");
  });
});

describe("activation classifiers", () => {
  it("names the three things that cost combat economy", () => {
    expect(ALL_ACTIVATIONS.filter(costsCombatEconomy)).toEqual([
      "action",
      "bonus_action",
      "reaction",
    ]);
  });

  it("names an attack as drawing on the Attack action", () => {
    expect(ALL_ACTIVATIONS.filter(costsAttack)).toEqual(["attack"]);
  });

  it("does not count an attack against the combat economy directly", () => {
    // the Attack action is what costs an action; the swings it grants do not
    expect(costsCombatEconomy("attack")).toBe(false);
  });

  it("names the activations that cost nothing", () => {
    expect(ALL_ACTIVATIONS.filter(isFree)).toEqual(["special"]);
  });

  it("names the activations measured in wall-clock time", () => {
    expect(ALL_ACTIVATIONS.filter(isDowntime)).toEqual([
      "minute",
      "hour",
      "eight_hours",
    ]);
  });

  it("claims every activation exactly once, so a new member cannot fall through", () => {
    for (const activation of ALL_ACTIVATIONS) {
      const claims = [
        costsCombatEconomy(activation),
        costsAttack(activation),
        isFree(activation),
        isDowntime(activation),
      ].filter(Boolean);

      expect(claims, activation).toHaveLength(1);
    }
  });
});

describe("NoEffectSchema", () => {
  it("lets an action cost its activation and nothing else", () => {
    const disengage = ActionGrantSchema.parse({
      id: "action_disengage",
      name: "Disengage",
      activation: "action",
      effect: { type: "no_effect" },
    });

    expect(disengage.effect.type).toBe("no_effect");
  });

  it("carries no fields to get wrong", () => {
    const parsed = ActionGrantSchema.parse({
      id: "action_disengage",
      name: "Disengage",
      activation: "action",
      effect: { type: "no_effect", damage: "ignored" },
    });

    expect(parsed.effect).toEqual({ type: "no_effect" });
  });
});
