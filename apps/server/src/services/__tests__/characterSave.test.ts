import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredChoices, toCharacterSave } from "../characterSave.js";

const row = (overrides: Record<string, unknown> = {}) => ({
  raceId: "race_dwarf",
  subraceId: "subrace_dwarf_hill",
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 10,
  cha: 8,
  currentHp: 20,
  maxHp: 24,
  ...overrides,
});

const fighterLedger = [
  { classId: "class_fighter", classLevel: 1, subclassId: null },
];

describe("toCharacterSave", () => {
  it("carries the character's background into the save", () => {
    const save = toCharacterSave(
      row({ backgroundId: "background_criminal" }),
      fighterLedger,
    );

    expect(save.backgroundId).toBe("background_criminal");
  });

  it("leaves the background off a character that has none", () => {
    const save = toCharacterSave(row({ backgroundId: null }), fighterLedger);

    expect("backgroundId" in save).toBe(false);
  });

  it("answers each class's questions from the stored choices", () => {
    const save = toCharacterSave(row(), fighterLedger, {
      classSelections: {
        class_fighter: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
      },
      traitSelections: { fighter_starting_skills: ["athletics", "perception"] },
    });

    expect(save.classes[0]?.selections).toEqual({
      fighter_level_1_fighting_style: ["trait_fs_defense"],
    });
    expect(save.traitSelections).toEqual({
      fighter_starting_skills: ["athletics", "perception"],
    });
  });

  it("gives a class with no stored answers an empty selection map", () => {
    const save = toCharacterSave(row(), fighterLedger);

    expect(save.classes[0]?.selections).toEqual({});
    expect(save.traitSelections).toEqual({});
  });
});

describe("readStoredChoices", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a valid stored value as parsed", () => {
    const stored = {
      classSelections: {},
      traitSelections: { half_elf_asi_choice: ["DEX", "CON"] },
    };

    expect(readStoredChoices(stored, "char-1")).toEqual(stored);
  });

  it("treats a missing value as no answers", () => {
    expect(readStoredChoices(undefined, "char-1")).toEqual({
      classSelections: {},
      traitSelections: {},
    });
  });

  // one bad row must not block a player's join
  it("logs a corrupt value against the character and treats it as empty", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(readStoredChoices({ classSelections: "nope" }, "char-9")).toEqual({
      classSelections: {},
      traitSelections: {},
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("char-9"),
      expect.anything(),
    );
  });
});
