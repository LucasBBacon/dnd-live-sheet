import { describe, expect, it, vi } from "vitest";
import type { CharacterSave, TraitDefinition } from "@project/shared";
import type { InventoryInstance } from "@project/shared";
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

const buildSheet = (
  save: CharacterSave,
  inventory: InventoryInstance[] = [],
  options: Parameters<typeof CharacterEngine.buildLiveSheet>[4] = {},
) =>
  CharacterEngine.buildLiveSheet(
    save,
    inventory,
    new EffectManager(),
    new ResourceManager(),
    options,
  );

const carried = (
  itemId: string,
  quantity = 1,
): InventoryInstance => ({
  id: `inv_${itemId}_${quantity}`,
  itemId,
  quantity,
  slot: "backpack",
  isAttuned: false,
});

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
      [],
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

/**
 * The half-elf fighter fixture has STR 15 and no strength modifiers, so
 * capacity is 225 lb, with variant thresholds at 75 lb and 150 lb. Plate
 * armour weighs 65 lb, which makes it a convenient unit of load.
 */
describe("CharacterEngine.buildLiveSheet: speed and encumbrance", () => {
  const variant = { encumbranceRules: { useVariantEncumbrance: true } };

  it("reports the racial walking speed", () => {
    // race_half_elf is 30ft
    expect(buildSheet(halfElfFighter()).speed.total).toBe(30);
  });

  it("weighs the pack and reports capacity", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate")]);

    expect(sheet.encumbrance.totalWeight).toBe(65);
    expect(sheet.encumbrance.maxCapacity).toBe(225);
  });

  it("leaves a heavy pack alone under the standard rule", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate", 3)]);

    expect(sheet.encumbrance.totalWeight).toBe(195);
    expect(sheet.encumbrance.tier).toBe("none");
    expect(sheet.speed.total).toBe(30);
  });

  it("slows a loaded character once the variant rule is on", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 2)], // 130 lb, past the 75 lb threshold
      variant,
    );

    expect(sheet.encumbrance.tier).toBe("encumbered");
    expect(sheet.speed.total).toBe(20);
  });

  it("slows it further past STR x 10", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 3)], // 195 lb, past the 150 lb threshold
      variant,
    );

    expect(sheet.encumbrance.tier).toBe("heavily_encumbered");
    expect(sheet.speed.total).toBe(10);
  });

  it("caps a character who is over capacity under either rule", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate", 4)]);

    expect(sheet.encumbrance.tier).toBe("over_capacity");
    expect(sheet.speed.total).toBe(5);

    expect(
      buildSheet(halfElfFighter(), [carried("item_armor_plate", 4)], variant)
        .encumbrance.tier,
    ).toBe("over_capacity");
  });

  it("puts the derived tier in activeStates but not in baseStates", () => {
    const sheet = buildSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 2)],
      variant,
    );

    expect(sheet.activeStates).toContain("encumbered");
    expect(sheet.baseStates).not.toContain("encumbered");
  });

  it("does not let encumbrance feed back into the ability scores", () => {
    // a STR bonus that only switches on if a stage-one calculator is handed
    // the derived tier. this is the actual loop: +4 STR raises capacity, which
    // lowers the tier, which withdraws the +4 - no fixed point.
    const cursed = new EffectManager();
    cursed.addEffect({
      instanceId: "test_cursed_belt",
      sourceName: "Cursed Belt",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [
        {
          id: "cursed_belt_str",
          sourceName: "Cursed Belt",
          sourceOrigin: "test",
          target: "STR",
          type: "add",
          value: 4,
          scalingFactor: "none",
          requiredStates: ["heavily_encumbered"],
          forbiddenStates: [],
          isActive: true,
        },
      ],
      grantedStates: [],
    });

    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      [carried("item_armor_plate", 3)], // 195 lb, past the 150 lb threshold
      cursed,
      new ResourceManager(),
      { encumbranceRules: { useVariantEncumbrance: true } },
    );

    expect(sheet.encumbrance.tier).toBe("heavily_encumbered");
    expect(sheet.activeStates).toContain("heavily_encumbered");
    // the belt's modifier is gated on a state only sheetStates carries, so a
    // stage one that leaked sheetStates would score STR 19 here
    expect(sheet.abilities.STR.score).toBe(15);
  });

  it("doubles carrying capacity for a character with Powerful Build", () => {
    const powerful = new EffectManager();
    powerful.addEffect({
      instanceId: "test_powerful_build",
      sourceName: "Powerful Build",
      durationType: "manual",
      isSelfConcentration: false,
      modifiers: [],
      grantedStates: ["powerful_build"],
    });

    const sheet = CharacterEngine.buildLiveSheet(
      halfElfFighter(),
      [],
      powerful,
      new ResourceManager(),
    );

    expect(sheet.encumbrance.maxCapacity).toBe(450); // 15 STR x 15 x 2
  });

  it("carries a trait-granted state into baseStates", () => {
    // no race grants a state-bearing trait yet, so the StateExtractor wiring
    // has nothing real to pick up - stub the compile step to prove the call
    // is actually made rather than silently dead
    const spy = vi
      .spyOn(CharacterBootstrapper, "compileActiveTraits")
      .mockReturnValue([TRAIT_DICTIONARY["trait_powerful_build"]!]);

    try {
      const sheet = buildSheet(halfElfFighter());

      expect(sheet.baseStates).toContain("powerful_build");
      expect(sheet.encumbrance.maxCapacity).toBe(450);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("CharacterEngine.buildLiveSheet: inventory modifiers", () => {
  it("applies the AC of worn armour", () => {
    const sheet = buildSheet(halfElfFighter(), [
      { ...carried("item_armor_plate"), slot: "body" },
    ]);

    // plate sets base AC 18 with no dex, beating the 12 of an unarmoured
    // half-elf with +2 DEX
    expect(sheet.armorClass.total).toBe(18);
  });

  it("leaves armour in the pack out of the maths", () => {
    const sheet = buildSheet(halfElfFighter(), [carried("item_armor_plate")]);

    expect(sheet.armorClass.total).toBe(12);
  });
});
