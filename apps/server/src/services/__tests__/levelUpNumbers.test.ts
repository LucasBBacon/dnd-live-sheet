import { describe, expect, it } from "vitest";
import { checkLevelUpNumbers } from "../levelUpNumbers.js";

/** Brannoc Hale's scores before fighter 4: a hill dwarf, CON 13 + 2 */
const scoresBefore = { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 };

const check =
  (
    payload: { hpRoll?: unknown; asiChoices?: unknown },
    scores: typeof scoresBefore = scoresBefore,
  ) =>
  () =>
    checkLevelUpNumbers({ payload, scoresBefore: scores, hitDie: 10 });

describe("checkLevelUpNumbers (#106)", () => {
  it("accepts a roll within the hit die with no increase", () => {
    expect(check({ hpRoll: 6 })).not.toThrow();
    expect(check({ hpRoll: 6, asiChoices: [] })).not.toThrow();
  });

  it("accepts +2 to one ability, and +1 to each of two", () => {
    expect(check({ hpRoll: 1, asiChoices: [{ stat: "CON", value: 2 }] })).not.toThrow();
    expect(
      check({
        hpRoll: 10,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      }),
    ).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["above the hit die", 11],
    ["fractional", 6.5],
    ["a string", "6"],
  ])("rejects an hpRoll that is %s", (_label, hpRoll) => {
    expect(check({ hpRoll })).toThrow(
      "Invalid character choices: hpRoll must be a whole number from 1 to 10.",
    );
  });

  it("rejects asiChoices that is not a list of one or two", () => {
    const message =
      "Invalid character choices: asiChoices must list one or two ability score increases.";
    expect(check({ hpRoll: 6, asiChoices: { stat: "CON", value: 2 } })).toThrow(message);
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "STR", value: 1 },
          { stat: "DEX", value: 1 },
          { stat: "CON", value: 1 },
        ],
      }),
    ).toThrow(message);
  });

  it("rejects a stat that is not an ability", () => {
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "LUCK", value: 2 }] })).toThrow(
      'Invalid character choices: "LUCK" is not an ability.',
    );
  });

  it("rejects the same stat named twice", () => {
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "CON", value: 1 },
        ],
      }),
    ).toThrow("Invalid character choices: CON is increased twice.");
  });

  it("rejects an increase that is not a positive whole number", () => {
    expect(
      check({
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1.5 },
          { stat: "STR", value: 0.5 },
        ],
      }),
    ).toThrow(
      "Invalid character choices: the increase to CON must be a positive whole number.",
    );
  });

  it("rejects increases that do not total 2", () => {
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "CON", value: 3 }] })).toThrow(
      "Invalid character choices: ability score increases must total 2, not 3.",
    );
    expect(check({ hpRoll: 6, asiChoices: [{ stat: "CON", value: 1 }] })).toThrow(
      "Invalid character choices: ability score increases must total 2, not 1.",
    );
  });

  it("rejects an increase that would take a score above 20", () => {
    expect(
      check(
        { hpRoll: 6, asiChoices: [{ stat: "STR", value: 2 }] },
        { ...scoresBefore, str: 19 },
      ),
    ).toThrow("Invalid character choices: STR would rise above 20.");
  });
});
