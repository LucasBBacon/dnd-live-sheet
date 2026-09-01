import { describe, expect, it } from "vitest";
import {
  ActionActivationSchema,
  ActionGrantSchema,
  costsAttack,
  costsCombatEconomy,
  isDowntime,
  isFree,
  type ActionActivation,
} from "../content/actions.js";

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

describe("tableNote", () => {
  it("carries a rule the engine cannot enforce on the action, not the effect", () => {
    const parsed = ActionGrantSchema.parse({
      id: "action_caltrops_bag_spread",
      name: "Spread Caltrops",
      activation: "action",
      tableNote: "DC 15 Dexterity saving throw or stop moving.",
      effect: { type: "no_effect" },
    });

    expect(parsed.tableNote).toBe(
      "DC 15 Dexterity saving throw or stop moving.",
    );
  });

  it("lets an action be silent, because some legitimately are", () => {
    // Disengage, Help and Ready are no_effect and need no note - their name is
    // the rule, which is what NoEffectSchema's own comment says. 111 spell
    // stubs are no_effect placeholders too. A schema-level "must carry a note"
    // would be a false claim about all three.
    expect(() =>
      ActionGrantSchema.parse({
        id: "action_disengage",
        name: "Disengage",
        activation: "action",
        effect: { type: "no_effect" },
      }),
    ).not.toThrow();
  });

  it("does not require a note from an action the engine actually runs", () => {
    expect(() =>
      ActionGrantSchema.parse({
        id: "action_acid_vial_throw",
        name: "Throw Acid",
        activation: "action",
        effect: {
          type: "attack",
          attackType: "ranged_weapon",
          attackStat: "DEX",
          range: 20,
          damage: [
            { sourceName: "Acid", baseDice: "2d6", damageType: "acid" },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("no longer accepts specialNote on an attack effect", () => {
    const parsed = ActionGrantSchema.parse({
      id: "action_legacy_note",
      name: "Legacy Note",
      activation: "action",
      effect: {
        type: "attack",
        attackType: "melee_weapon",
        attackStat: "STR",
        range: 5,
        damage: [],
        specialNote: "should be stripped",
      },
    });

    expect("specialNote" in parsed.effect).toBe(false);
  });
});
