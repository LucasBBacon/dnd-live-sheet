import { describe, expect, it } from "vitest";
import { DiceEngine } from "../diceParser.js";
import { FIGHTING_STYLE_TRAITS } from "../../rules/traits/fightingStyleDictionary.js";

describe("DiceEngine dice-rule application", () => {
  it("maximizes every die while preserving the expression modifier", () => {
    expect(DiceEngine.rollMaximized("2d6 + 3")).toEqual({
      total: 15,
      rolls: [6, 6],
      modifier: 3,
    });
  });

  it("rerolls matching damage dice for authored traits when the required state is active", () => {
    const trait = FIGHTING_STYLE_TRAITS.trait_fs_great_weapon_fighting;

    const rerolled = DiceEngine.applyDiceRules(
      [1, 4],
      trait?.diceRules ?? [],
      "DAMAGE_ROLL",
      {
        activeStates: ["action_melee_attack", "status_wielding_two_handed"],
        sides: 6,
        rollFn: () => 5,
      },
    );

    expect(rerolled).toEqual([5, 4]);
  });

  it("does not reroll when the required state is not active", () => {
    const trait = FIGHTING_STYLE_TRAITS.trait_fs_great_weapon_fighting;

    const rerolled = DiceEngine.applyDiceRules(
      [1, 4],
      trait?.diceRules ?? [],
      "DAMAGE_ROLL",
      {
        activeStates: ["action_melee_attack"],
        sides: 6,
        rollFn: () => 5,
      },
    );

    expect(rerolled).toEqual([1, 4]);
  });
});
