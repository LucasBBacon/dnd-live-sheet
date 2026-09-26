import { describe, expect, it } from "vitest";
import type { CharacterSave, RuntimeModifier } from "@project/shared";
import { synthesizeSpells } from "../spellSynthesizer.js";
import { corePackLookup } from "./corePackFixture.js";
import type { Ability } from "../../types/core.js";

const scores = (
  overrides: Partial<Record<Ability, number>> = {},
): Record<Ability, number> => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...overrides,
});

const save = (overrides: Partial<CharacterSave>): CharacterSave => ({
  attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [],
  traitSelections: {},
  feats: [],
  hp: { current: 10, temporary: 0, baseRolledHp: 10, hitDiceSpent: {} },
  ...overrides,
});

const synthesize = (
  character: CharacterSave,
  abilityScores = scores(),
  proficiencyBonus = 2,
  modifiers: RuntimeModifier[] = [],
) =>
  synthesizeSpells({
    save: character,
    snapshot: corePackLookup(),
    abilityScores,
    proficiencyBonus,
    modifiers,
    activeStates: [],
  });

const DROW = {
  baseRaceId: "race_elf",
  hasSubraces: true,
  subraceId: "subrace_elf_dark",
} as const;

const warlock = (level: number) =>
  save({
    classes: [
      {
        classId: "class_warlock",
        level,
        selections: {
          warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
        },
      },
    ],
  });

const drowWizard = (level: number) =>
  save({
    race: DROW,
    classes: [{ classId: "class_wizard", level, selections: {} }],
  });

const lightCleric = (level: number, race: CharacterSave["race"] = save({}).race) =>
  save({
    race,
    classes: [
      {
        classId: "class_cleric",
        level,
        subclassId: "subclass_cleric_light",
        selections: {},
      },
    ],
  });

const find = (
  result: ReturnType<typeof synthesize>,
  spellId: string,
  sourceKey?: string,
) =>
  result.spells.find(
    (spell) =>
      spell.spellId === spellId &&
      (sourceKey === undefined || spell.actionId?.endsWith(`@${sourceKey}`)),
  );

const actionOf = (result: ReturnType<typeof synthesize>, actionId: string) =>
  result.actions.find((action) => action.id === actionId);

describe("synthesizeSpells", () => {
  it("lists a warlock's Eldritch Blast, cast with Charisma", () => {
    const result = synthesize(warlock(4), scores({ CHA: 15 }));

    expect(find(result, "spell_eldritch_blast")).toMatchObject({
      name: "Eldritch Blast",
      level: 0,
      source: { kind: "class", classId: "class_warlock", label: "Warlock" },
      ability: "CHA",
      attackBonus: 4,
      saveDc: 12,
      payment: { kind: "at_will" },
      actionId: "action_spell_eldritch_blast@class_warlock",
      range: { kind: "feet", feet: 120 },
    });
  });

  it.each([
    [4, 1],
    [5, 2],
    [11, 3],
    [17, 4],
  ])("stamps a level-%i warlock's attack bonus and %i beam(s)", (level, beams) => {
    const effect = actionOf(
      synthesize(warlock(level), scores({ CHA: 15 })),
      "action_spell_eldritch_blast@class_warlock",
    )?.effect;

    expect(effect?.type === "attack" && effect.attackBonus).toBe(4);
    expect(effect?.type === "attack" && effect.repeatCount).toBe(beams);
  });

  it("doubles a critical beam's dice", () => {
    const effect = actionOf(
      synthesize(warlock(1)),
      "action_spell_eldritch_blast@class_warlock",
    )?.effect;

    expect(effect?.type === "attack" && effect.criticalDamage?.[0]?.baseDice).toBe("2d10");
  });

  it("lists a stub the character picked, and makes no action of it", () => {
    const result = synthesize(warlock(1));

    expect(find(result, "spell_minor_illusion")?.actionId).toBeUndefined();
    expect(
      result.actions.some((action) => action.id.startsWith("action_spell_minor_illusion")),
    ).toBe(false);
  });

  it("grants a drow Dancing Lights at will with Charisma, and Faerie Fire from third level", () => {
    const second = synthesize(drowWizard(2), scores({ CHA: 11 }));
    const third = synthesize(drowWizard(3), scores({ CHA: 11 }));

    expect(find(second, "spell_dancing_lights")).toMatchObject({
      source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
      ability: "CHA",
      payment: { kind: "at_will" },
      focusCategories: [],
    });
    expect(find(second, "spell_faerie_fire")).toBeUndefined();
    expect(find(third, "spell_faerie_fire")?.payment).toEqual({
      kind: "resource",
      resourceId: "drow_magic_faerie_fire",
    });
    expect(
      actionOf(third, "action_spell_faerie_fire@drow_magic")?.consumesResource,
    ).toBe("drow_magic_faerie_fire");
  });

  it("gives a Light cleric's domain spells to the cleric, paid with slots", () => {
    expect(find(synthesize(lightCleric(1), scores({ WIS: 16 })), "spell_burning_hands")).toMatchObject({
      source: { kind: "class", classId: "class_cleric", label: "Cleric" },
      ability: "WIS",
      saveDc: 13,
      payment: { kind: "slot" },
      preparationTracked: true,
      focusCategories: ["category_holy_symbol"],
    });
  });

  it("stamps Burning Hands' DC, casting ability and area onto its save", () => {
    const effect = actionOf(
      synthesize(lightCleric(1), scores({ WIS: 16 })),
      "action_spell_burning_hands@class_cleric",
    )?.effect;

    expect(effect?.type === "save" && effect.savingThrow.dc).toBe(13);
    expect(effect?.type === "save" && effect.savingThrow.dcCalculation.scalingStat).toBe("WIS");
    expect(effect?.type === "save" && effect.areaOfEffect).toEqual({ shape: "cone", size: 15 });
  });

  it("lists Faerie Fire once for each source that grants it", () => {
    const ids = synthesize(lightCleric(3, DROW))
      .spells.filter((spell) => spell.spellId === "spell_faerie_fire")
      .map((spell) => spell.actionId)
      .sort();

    expect(ids).toEqual([
      "action_spell_faerie_fire@class_cleric",
      "action_spell_faerie_fire@drow_magic",
    ]);
  });

  it("folds a SPELLCASTING_MOD bonus into the numbers", () => {
    const rod: RuntimeModifier = {
      id: "mod_rod",
      target: "SPELLCASTING_MOD",
      type: "add",
      value: 1,
      scalingFactor: "none",
      requiredStates: [],
      forbiddenStates: [],
      sourceName: "Rod of the Pact Keeper",
      sourceOrigin: "item",
      isActive: true,
    };

    expect(
      find(synthesize(warlock(1), scores({ CHA: 15 }), 2, [rod]), "spell_eldritch_blast")?.attackBonus,
    ).toBe(5);
  });

  it("flags a prepared caster's leveled pick, and nobody else's", () => {
    const wizard = synthesize(
      save({
        classes: [
          {
            classId: "class_wizard",
            level: 1,
            selections: { wizard_level_1_spellbook: ["spell_burning_hands"] },
          },
        ],
      }),
    );
    const sorcerer = synthesize(
      save({
        classes: [
          {
            classId: "class_sorcerer",
            level: 1,
            selections: { sorcerer_level_1_spells_known: ["spell_burning_hands"] },
          },
        ],
      }),
    );

    expect(find(wizard, "spell_burning_hands")?.preparationTracked).toBe(false);
    expect(find(sorcerer, "spell_burning_hands")?.preparationTracked).toBe(true);
  });

  it("collects the pools that pay for spells, pact slots at the warlock's slot level", () => {
    expect(synthesize(warlock(5)).slotPools).toEqual([
      { resourceId: "pact_slots", level: 3 },
    ]);
    expect(synthesize(lightCleric(3)).slotPools.map((pool) => pool.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  // PHB p.164: pact slots can pay for a spell from any class, and spell slots
  // for a warlock spell; settleSpellCast accepts any pool of a high enough level
  it("gives a warlock/cleric both kinds of pool to pay a cleric spell with", () => {
    const result = synthesize(
      save({
        classes: [
          { classId: "class_warlock", level: 1, selections: {} },
          {
            classId: "class_cleric",
            level: 1,
            subclassId: "subclass_cleric_light",
            selections: {},
          },
        ],
      }),
    );

    expect(find(result, "spell_burning_hands")?.payment).toEqual({ kind: "slot" });
    expect(result.slotPools).toEqual(
      expect.arrayContaining([
        { resourceId: "pact_slots", level: 1 },
        { resourceId: "spell_slots_1", level: 1 },
      ]),
    );
  });

  it("gives a character with no spells nothing", () => {
    expect(
      synthesize(
        save({
          classes: [
            {
              classId: "class_fighter",
              level: 1,
              selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
            },
          ],
        }),
      ),
    ).toEqual({ spells: [], actions: [], slotPools: [] });
  });
});
