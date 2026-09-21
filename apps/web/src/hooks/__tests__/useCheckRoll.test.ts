import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiceEngine } from "@project/engine";

const mocks = vi.hoisted(() => ({
  requestRoll: vi.fn(),
  recordRollResult: vi.fn(),
}));

vi.mock("../../store/rollStore", () => ({
  useRollStore: (selector: (state: unknown) => unknown) =>
    selector({ requestRoll: mocks.requestRoll }),
}));

vi.mock("../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: unknown) => unknown) =>
    selector({
      recordRollResult: mocks.recordRollResult,
      id: "char_1",
      // Pre-racial base scores and the store's raw active states - #77's
      // point is that the hook must NOT hand these to the dice engine.
      activeStates: ["store_state_only"],
      baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      getActiveTraits: () => [],
    }),
}));

vi.mock("../useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 18, modifier: 4 },
      DEX: { score: 14, modifier: 2 },
      CON: { score: 12, modifier: 1 },
      INT: { score: 10, modifier: 0 },
      WIS: { score: 10, modifier: 0 },
      CHA: { score: 10, modifier: 0 },
    },
    totalMods: [],
    activeStates: ["sheet_state_only"],
  }),
}));

import { useCheckRoll } from "../useCheckRoll";

describe("useCheckRoll", () => {
  beforeEach(() => {
    mocks.requestRoll.mockReset();
    mocks.recordRollResult.mockReset();
  });

  it("asks for a d20 rather than pre-rolling for the player", async () => {
    mocks.requestRoll.mockResolvedValueOnce(11);

    await useCheckRoll()({
      label: "Stealth",
      modifier: 5,
      target: "ABILITY_CHECK",
    });

    expect(mocks.requestRoll).toHaveBeenCalledWith(
      "1d20",
      expect.stringContaining("Stealth"),
      expect.anything(),
    );
  });

  it("adds the modifier to what the die showed", async () => {
    mocks.requestRoll.mockResolvedValueOnce(11);

    await useCheckRoll()({
      label: "Stealth",
      modifier: 5,
      target: "ABILITY_CHECK",
    });

    expect(mocks.recordRollResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rollResults: [
          expect.objectContaining({ total: 16, modifier: 5, rolls: [11] }),
        ],
      }),
    );
  });

  it("handles a negative modifier without pretending it is a bonus", async () => {
    mocks.requestRoll.mockResolvedValueOnce(10);

    await useCheckRoll()({
      label: "Stealth",
      modifier: -1,
      target: "ABILITY_CHECK",
    });

    expect(mocks.recordRollResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rollResults: [expect.objectContaining({ total: 9 })],
      }),
    );
  });

  it("records a saving throw under its own target", async () => {
    mocks.requestRoll.mockResolvedValueOnce(8);

    await useCheckRoll()({
      label: "Dexterity save",
      modifier: 2,
      target: "SAVING_THROW",
    });

    expect(mocks.recordRollResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rollResults: [expect.objectContaining({ target: "SAVING_THROW" })],
      }),
    );
  });

  it("labels the entry so the roll log says what was rolled", async () => {
    mocks.requestRoll.mockResolvedValueOnce(8);

    await useCheckRoll()({
      label: "Perception",
      modifier: 0,
      target: "ABILITY_CHECK",
    });

    expect(mocks.recordRollResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rollResults: [expect.objectContaining({ label: "Perception" })],
      }),
    );
  });

  it("records nothing when the player cancels the roll", async () => {
    mocks.requestRoll.mockRejectedValueOnce(new Error("cancelled"));

    await useCheckRoll()({
      label: "Stealth",
      modifier: 5,
      target: "ABILITY_CHECK",
    });

    expect(mocks.recordRollResult).not.toHaveBeenCalled();
  });

  it("hands dice rules the character's final ability scores and the sheet's states, not the store's pre-racial scores and raw states (#77)", async () => {
    const spy = vi.spyOn(DiceEngine, "applyDiceRulesToRollResult");
    mocks.requestRoll.mockResolvedValueOnce(11);

    await useCheckRoll()({
      label: "Strength save",
      modifier: 4,
      target: "SAVING_THROW",
      ability: "STR",
    });

    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "SAVING_THROW",
      expect.objectContaining({
        activeStates: ["sheet_state_only"],
        abilityScores: {
          STR: 18,
          DEX: 14,
          CON: 12,
          INT: 10,
          WIS: 10,
          CHA: 10,
        },
      }),
    );

    spy.mockRestore();
  });
});
