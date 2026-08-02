import { describe, expect, it } from "vitest";
import type { CharacterSave, TraitDefinition } from "@project/shared";
import { TRAIT_DICTIONARY } from "../../rules/traitDictionary.js";
import { CharacterEngine } from "../characterEngine.js";
import { CharacterBootstrapper } from "../characterBootstraper.js";
import { ModifierExtractor } from "../modifierExtractor.js";
import { ProficiencyExtractor } from "../proficiencyExtractor.js";
import { EffectManager } from "../../calculators/effects.js";
import { ResourceManager } from "../../calculators/resources.js";

/**
 * A half-elf fighter is the useful fixture here: the race carries both a
 * modifier choice block (+1 to two abilities) and two proficiency choice blocks
 * (skills, language), so one save exercises every path the extractors have.
 */
const halfElfFighter = (
  overrides: Partial<CharacterSave> = {},
): CharacterSave => ({
  attributes: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  race: { baseRaceId: "race_half_elf", hasSubraces: false, subraceId: null },
  classes: [
    {
      classId: "class_fighter",
      level: 1,
      selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
    },
  ],
  traitSelections: {
    half_elf_asi_choice: ["DEX", "CON"],
    skill_versatility_choice: ["stealth", "perception"],
    half_elf_language_choice: ["dwarvish"],
  },
  hp: { current: 12, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
  ...overrides,
});

const buildSheet = (save: CharacterSave) =>
  CharacterEngine.buildLiveSheet(
    save,
    new EffectManager(),
    new ResourceManager(),
  );

describe("CharacterBootstrapper.compileActiveTraits", () => {
  it("resolves race, subrace, class and chosen traits into definitions", () => {
    const ids = CharacterBootstrapper.compileActiveTraits(halfElfFighter()).map(
      (trait) => trait.id,
    );

    expect(ids).toContain("race_half_elf_asi"); // race
    expect(ids).toContain("skill_versatility"); // race
    expect(ids).toContain("trait_fs_defense"); // the fighting style chosen
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips ids that have no definition authored yet", () => {
    const ids = CharacterBootstrapper.compileActiveTraits(halfElfFighter()).map(
      (trait) => trait.id,
    );

    // granted by the fighter blueprint, but absent from TRAIT_DICTIONARY
    expect(
      CharacterBootstrapper.resolveGrantedTraitIds(halfElfFighter()),
    ).toContain("trait_second_wind");
    expect(ids).not.toContain("trait_second_wind");
  });

  it("gives a multiclassed class only its reduced dip proficiencies", () => {
    const dip = halfElfFighter({
      classes: [
        { classId: "class_rogue", level: 1, selections: {} },
        { classId: "class_fighter", level: 1, selections: {} },
      ],
    });
    const ids = CharacterBootstrapper.resolveGrantedTraitIds(dip);

    expect(ids).toContain("trait_fighter_mult_prof_armor");
    expect(ids).not.toContain("trait_fighter_prof_saving_throw");
  });
});

describe("ModifierExtractor.extractModifiers", () => {
  const extract = (save: CharacterSave) =>
    ModifierExtractor.extractModifiers(
      CharacterBootstrapper.compileActiveTraits(save),
      CharacterBootstrapper.resolveSelections(save),
    );

  it("synthesizes a modifier per selected target in a choice block", () => {
    const mods = extract(halfElfFighter());

    expect(
      mods.filter((m) => m.target === "DEX" && m.sourceOrigin.includes("asi")),
    ).toHaveLength(1);
    expect(
      mods.filter((m) => m.target === "CON" && m.sourceOrigin.includes("asi")),
    ).toHaveLength(1);
  });

  it("gives every modifier a distinct id so set_base entries stay separable", () => {
    const ids = extract(halfElfFighter()).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drops picks that are not options on the block", () => {
    const save = halfElfFighter({
      traitSelections: { half_elf_asi_choice: ["CHA", "DEX"] },
    });
    // CHA is excluded from the half-elf block: it already gets the fixed +2
    const chosen = extract(save).filter((m) => m.sourceOrigin.includes("asi"));

    expect(chosen.map((m) => m.target)).toEqual(["CHA", "DEX"]);
    expect(chosen.filter((m) => m.type === "add" && m.value === 1)).toHaveLength(
      1,
    );
  });

  it("honours chooseAmount and refuses duplicates when the block forbids them", () => {
    const save = halfElfFighter({
      traitSelections: { half_elf_asi_choice: ["DEX", "DEX", "CON", "INT"] },
    });
    const fromChoice = extract(save).filter(
      (m) => m.value === 1 && m.sourceOrigin.includes("asi"),
    );

    expect(fromChoice.map((m) => m.target)).toEqual(["DEX", "CON"]);
  });
});

describe("ProficiencyExtractor.extractProficiencies", () => {
  const extract = (save: CharacterSave) =>
    ProficiencyExtractor.extractProficiencies(
      CharacterBootstrapper.compileActiveTraits(save),
      CharacterBootstrapper.resolveSelections(save),
    );

  it("resolves choice blocks into concrete grants", () => {
    const grants = extract(halfElfFighter());

    expect(grants).toContainEqual({
      category: "skills",
      proficiencyId: "stealth",
      level: "proficient",
      requiredStates: [],
    });
    expect(grants).toContainEqual({
      category: "languages",
      proficiencyId: "dwarvish",
      level: "proficient",
      requiredStates: [],
    });
  });

  it("keeps fixed grants alongside resolved choices", () => {
    const languages = extract(halfElfFighter())
      .filter((g) => g.category === "languages")
      .map((g) => g.proficiencyId);

    expect(languages).toEqual(
      expect.arrayContaining(["common", "elvish", "dwarvish"]),
    );
  });

  it("caps a block at its chooseAmount", () => {
    const save = halfElfFighter({
      traitSelections: {
        skill_versatility_choice: ["stealth", "perception", "athletics"],
      },
    });
    const skills = extract(save).filter((g) => g.category === "skills");

    expect(skills.map((g) => g.proficiencyId)).toEqual([
      "stealth",
      "perception",
    ]);
  });

  it("reports blocks the player has not answered", () => {
    const save = halfElfFighter({ traitSelections: {} });
    const pending = ProficiencyExtractor.listPendingChoices(
      CharacterBootstrapper.compileActiveTraits(save),
      CharacterBootstrapper.resolveSelections(save),
    );

    expect(pending).toContainEqual(
      expect.objectContaining({
        choiceId: "skill_versatility_choice",
        traitId: "skill_versatility",
        remainingPicks: 2,
      }),
    );
  });
});

describe("open proficiency choices", () => {
  const pendingChoice = (save: CharacterSave, choiceId: string) =>
    ProficiencyExtractor.listPendingChoices(
      CharacterBootstrapper.compileActiveTraits(save),
      CharacterBootstrapper.resolveSelections(save),
    ).find((choice) => choice.choiceId === choiceId);

  const extract = (save: CharacterSave) =>
    ProficiencyExtractor.extractProficiencies(
      CharacterBootstrapper.compileActiveTraits(save),
      CharacterBootstrapper.resolveSelections(save),
    );

  it("offers the whole language roster minus what the race already grants", () => {
    const options = pendingChoice(
      halfElfFighter({ traitSelections: {} }),
      "half_elf_language_choice",
    )?.availableOptions;

    // the half-elf gets Common and Elvish for free, so neither is on offer
    expect(options).not.toContain("common");
    expect(options).not.toContain("elvish");
    expect(options).toEqual(expect.arrayContaining(["dwarvish", "draconic"]));
  });

  it("never offers a language that can only come from a class feature", () => {
    const options = pendingChoice(
      halfElfFighter({ traitSelections: {} }),
      "half_elf_language_choice",
    )?.availableOptions;

    expect(options).not.toContain("druidic");
    expect(options).not.toContain("thieves_cant");
  });

  it("drops a pick the character already has for free", () => {
    const save = halfElfFighter({
      traitSelections: { half_elf_language_choice: ["elvish"] },
    });
    const languages = extract(save).filter((g) => g.category === "languages");

    // elvish is still known, but from the fixed grant - the pick was not spent
    expect(languages.map((g) => g.proficiencyId).sort()).toEqual([
      "common",
      "elvish",
    ]);
    expect(pendingChoice(save, "half_elf_language_choice")?.remainingPicks).toBe(
      1,
    );
  });

  it("refuses a language that is not in the roster at all", () => {
    const save = halfElfFighter({
      traitSelections: { half_elf_language_choice: ["klingon"] },
    });

    expect(
      extract(save).some((g) => g.proficiencyId === "klingon"),
    ).toBe(false);
  });

  it("stops two open blocks landing on the same language", () => {
    // a half-elf who also took the high-elf extra language block
    const traits = [
      ...CharacterBootstrapper.compileActiveTraits(halfElfFighter()),
      TRAIT_DICTIONARY["subrace_elf_high_extra_language"]!,
    ];
    const grants = ProficiencyExtractor.extractProficiencies(traits, {
      half_elf_language_choice: ["dwarvish"],
      elf_high_choice_extra_lang: ["dwarvish"],
    });

    expect(
      grants.filter((g) => g.proficiencyId === "dwarvish"),
    ).toHaveLength(1);
  });

  it("still offers a skill the character is only proficient in to an expertise block", () => {
    const proficientInStealth: TraitDefinition = {
      ...TRAIT_DICTIONARY["skill_versatility"]!,
      id: "test_expertise",
      name: "Test Expertise",
      proficiencies: {
        fixed: [],
        choices: [
          {
            id: "test_expertise_choice",
            category: "skills",
            chooseAmount: 1,
            level: "expertise",
            requiredStates: [],
          },
        ],
      },
    };

    const traits = [
      ...CharacterBootstrapper.compileActiveTraits(halfElfFighter()),
      proficientInStealth,
    ];
    const grants = ProficiencyExtractor.extractProficiencies(traits, {
      skill_versatility_choice: ["stealth", "perception"],
      test_expertise_choice: ["stealth"],
    });

    // expertise beats the proficiency already held, so the pick lands
    expect(grants).toContainEqual({
      category: "skills",
      proficiencyId: "stealth",
      level: "expertise",
      requiredStates: [],
    });
  });
});

describe("CharacterEngine.buildLiveSheet", () => {
  it("folds fixed and chosen ability modifiers into the final scores", () => {
    const sheet = buildSheet(halfElfFighter());

    expect(sheet.abilities.CHA.score).toBe(10); // 8 base + 2 fixed half-elf
    expect(sheet.abilities.DEX.score).toBe(15); // 14 base + 1 chosen
    expect(sheet.abilities.CON.score).toBe(14); // 13 base + 1 chosen
    expect(sheet.abilities.STR.score).toBe(15); // untouched
  });

  it("applies proficiency to the skills picked in a choice block", () => {
    const sheet = buildSheet(halfElfFighter());

    expect(sheet.proficiencyBonus).toBe(2);
    expect(sheet.skills.stealth!.multiplier).toBe(1);
    expect(sheet.skills.stealth!.totalModifier).toBe(4); // +2 DEX, +2 prof
    expect(sheet.skills.athletics!.multiplier).toBe(0);
  });

  it("gates a state-conditional modifier on the live state", () => {
    const bare = buildSheet(halfElfFighter());
    expect(bare.armorClass.total).toBe(12); // 10 + 2 DEX, no Defense style

    const armoured = new EffectManager();
    armoured.addEffect({
      instanceId: "test_armor",
      sourceName: "Chain Shirt",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["status_wearing_armor"],
    });

    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      armoured,
      new ResourceManager(),
    );
    expect(sheet.activeStates).toContain("status_wearing_armor");
    expect(sheet.armorClass.total).toBe(13); // Fighting Style: Defense now counts
  });

  it("carries the save's live hp through untouched", () => {
    const sheet = buildSheet(halfElfFighter());

    expect(sheet.currentHp).toBe(12);
    expect(sheet.maxHp.total).toBe(12); // 10 rolled + CON 2 x level 1
  });
});
