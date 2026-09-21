import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydrateCharacterSheet,
  type CharacterSheetPayload,
} from "../characterSheetRouteData";

const payload = (
  overrides: Partial<CharacterSheetPayload> = {},
): CharacterSheetPayload => ({
  id: "char-1",
  campaignId: "camp-1",
  level: 1,
  classLevels: { class_bard: 1 },
  raceId: "race_half_elf",
  subraceId: null,
  str: 8,
  dex: 14,
  con: 12,
  int: 10,
  wis: 10,
  cha: 15,
  inventory: [],
  currentHp: 8,
  maxHp: 8,
  ...overrides,
});

describe("hydrateCharacterSheet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the store the character's stored choices", () => {
    const initialize = vi.fn();
    const choices = {
      classSelections: {},
      traitSelections: { skill_versatility_choice: ["perception", "insight"] },
    };

    hydrateCharacterSheet(initialize, payload({ choices }));

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ choices: { ...choices, feats: [] } }),
    );
  });

  it("hands the store no answers when the stored value is corrupt", () => {
    const initialize = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    hydrateCharacterSheet(initialize, payload({ choices: { classSelections: "x" } }));

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: { classSelections: {}, traitSelections: {}, feats: [] },
      }),
    );
    expect(error).toHaveBeenCalled();
  });

  it("hands the store the background and the persisted pool counts", () => {
    const initialize = vi.fn();

    hydrateCharacterSheet(
      initialize,
      payload({
        backgroundId: "background_noble",
        resources: [{ id: "spell_slots_1", current: 3 }],
      }),
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundId: "background_noble",
        resources: [{ id: "spell_slots_1", current: 3 }],
      }),
    );
  });
});
