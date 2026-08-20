import { beforeEach, describe, expect, it, vi } from "vitest";

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
    selector({ recordRollResult: mocks.recordRollResult, id: "char_1" }),
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
});
