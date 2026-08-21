import { describe, expect, it, vi } from "vitest";
import { DiceEngine } from "../diceParser.js";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const FIGHTING_STYLE_TRAITS = corePackSnapshot().traitsById;

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

  it("applies dice rules to a full expression through one entry point", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = DiceEngine.applyDiceRulesToExpression(
      "1d20",
      [
        {
          target: "ATTACK_ROLL",
          requiredStates: ["status_wielding_two_handed"],
          mutator: { type: "reroll_once", triggerOn: [1] },
        },
      ],
      "ATTACK_ROLL",
      {
        activeStates: ["status_wielding_two_handed"],
        sides: 20,
        rollFn: () => 5,
      },
    );

    expect(result).toEqual({
      total: 5,
      rolls: [5],
      modifier: 0,
    });

    vi.restoreAllMocks();
  });
});
