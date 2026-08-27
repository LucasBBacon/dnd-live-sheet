import { describe, expect, it, vi } from "vitest";
import { DiceEngine } from "../diceParser.js";
import { corePackSnapshot } from "../../pipeline/__tests__/corePackFixture.js";

const fightingStyleTraits = () => corePackSnapshot().traitsById;

describe("DiceEngine dice-rule application", () => {
  it("maximizes every die while preserving the expression modifier", () => {
    expect(DiceEngine.rollMaximized("2d6 + 3")).toEqual({
      total: 15,
      rolls: [6, 6],
      modifier: 3,
    });
  });

  it("rerolls matching damage dice for authored traits when the required state is active", () => {
    const trait = fightingStyleTraits().trait_fs_great_weapon_fighting;

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
    const trait = fightingStyleTraits().trait_fs_great_weapon_fighting;

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

describe("DiceEngine flat damage expressions", () => {
  it("parses a bare integer as a modifier with no dice", () => {
    expect(DiceEngine.parse("1")).toEqual({
      count: 0,
      sides: 0,
      modifier: 1,
    });
  });

  it("rolls a flat expression to its own value with no dice rolled", () => {
    // a blowgun deals 1 piercing; there is nothing to randomize
    expect(DiceEngine.rollDigital("1")).toEqual({
      total: 1,
      rolls: [],
      modifier: 1,
    });
  });

  it("maximizes a flat expression to the same value", () => {
    // a crit doubles damage dice, and flat damage has none
    expect(DiceEngine.rollMaximized("1")).toEqual({
      total: 1,
      rolls: [],
      modifier: 1,
    });
  });

  it("still rejects the empty string", () => {
    expect(() => DiceEngine.parse("")).toThrow("Invalid dice expression");
  });

  it("still rejects malformed expressions", () => {
    expect(() => DiceEngine.parse("d6")).toThrow("Invalid dice expression");
    expect(() => DiceEngine.parse("1d")).toThrow("Invalid dice expression");
  });
});
