import { describe, expect, it } from "vitest";
import type { CharacterSave, TraitChoiceOption } from "@project/shared";
import {
  prerequisiteContext,
  unmetPrerequisites,
} from "../optionPrerequisites.js";
import { corePackLookup } from "./corePackFixture.js";

const snapshot = corePackLookup();

const attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const hp = { current: 1, temporary: 0, baseRolledHp: 1, hitDiceSpent: {} };

/** a human Fiend warlock at the given level with the given class picks */
const warlock = (
  level: number,
  selections: Record<string, string[]>,
): CharacterSave => ({
  attributes,
  race: { baseRaceId: "race_human", hasSubraces: false, subraceId: null },
  classes: [
    {
      classId: "class_warlock",
      level,
      subclassId: "subclass_warlock_fiend",
      selections,
    },
  ],
  traitSelections: {},
  feats: [],
  hp,
});

const agonizingBlast: TraitChoiceOption = {
  traitId: "trait_invocation_agonizing_blast",
  prerequisites: { requiredSpellIds: ["spell_eldritch_blast"] },
};

const thirstingBlade: TraitChoiceOption = {
  traitId: "trait_invocation_thirsting_blade",
  prerequisites: {
    minimumLevel: 5,
    requiredTraitIds: ["trait_pact_of_the_blade"],
  },
};

describe("unmetPrerequisites", () => {
  it("passes a plain option", () => {
    const context = prerequisiteContext(warlock(2, {}), 0, [], snapshot);

    expect(
      unmetPrerequisites("trait_invocation_devils_sight", context),
    ).toEqual([]);
  });

  it("reports a required spell the character does not know", () => {
    const context = prerequisiteContext(
      warlock(2, {
        warlock_level_1_cantrips: ["spell_minor_illusion", "spell_dancing_lights"],
      }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([
      { kind: "spell", spellId: "spell_eldritch_blast" },
    ]);
  });

  it("counts the class's own spell pick as known", () => {
    const context = prerequisiteContext(
      warlock(2, {
        warlock_level_1_cantrips: ["spell_eldritch_blast", "spell_minor_illusion"],
      }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([]);
  });

  it("counts a trait spell block's pick as known", () => {
    const context = prerequisiteContext(
      warlock(2, {}),
      0,
      ["spell_eldritch_blast"],
      snapshot,
    );

    expect(unmetPrerequisites(agonizingBlast, context)).toEqual([]);
  });

  it("reports a level too low and a missing trait, level first", () => {
    const context = prerequisiteContext(warlock(2, {}), 0, [], snapshot);

    expect(unmetPrerequisites(thirstingBlade, context)).toEqual([
      { kind: "level", classId: "class_warlock", level: 5 },
      { kind: "trait", traitId: "trait_pact_of_the_blade" },
    ]);
  });

  it("passes Thirsting Blade once the pact is taken and the level reached", () => {
    const context = prerequisiteContext(
      warlock(5, { warlock_level_3_pact_boon: ["trait_pact_of_the_blade"] }),
      0,
      [],
      snapshot,
    );

    expect(unmetPrerequisites(thirstingBlade, context)).toEqual([]);
  });

  it("checks against the class at the given index", () => {
    const fighterThenWarlock: CharacterSave = {
      ...warlock(2, {}),
      classes: [
        {
          classId: "class_fighter",
          level: 3,
          selections: { fighter_level_1_fighting_style: ["trait_fs_defense"] },
        },
        { classId: "class_warlock", level: 2, selections: {} },
      ],
    };

    const context = prerequisiteContext(fighterThenWarlock, 1, [], snapshot);

    expect(context.classState.classId).toBe("class_warlock");
    expect(unmetPrerequisites(thirstingBlade, context)[0]).toEqual({
      kind: "level",
      classId: "class_warlock",
      level: 5,
    });
  });
});
