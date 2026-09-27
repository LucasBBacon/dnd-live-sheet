import { describe, expect, it } from "vitest";
import path from "node:path";
import { assembleCoreRulePack } from "../corePackAssembler.js";

const SHIPPED_PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/**
 * How each casting class casts, as the PHB states it (chapter 3), and which
 * pools are spell slots. The schema only requires the fields to exist; this is
 * where their values are checked against the book.
 */
describe("the shipped pack declares how each class casts", () => {
  const EXPECTED: Record<
    string,
    { preparation: string; focusCategories: string[]; ritualCasting: boolean }
  > = {
    class_bard: {
      preparation: "known",
      focusCategories: ["category_musical_instrument"],
      ritualCasting: true,
    },
    class_cleric: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
      ritualCasting: true,
    },
    class_druid: {
      preparation: "prepared",
      focusCategories: ["category_druidic_focus"],
      ritualCasting: true,
    },
    class_paladin: {
      preparation: "prepared",
      focusCategories: ["category_holy_symbol"],
      ritualCasting: false,
    },
    class_ranger: { preparation: "known", focusCategories: [], ritualCasting: false },
    class_sorcerer: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: false,
    },
    class_warlock: {
      preparation: "known",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: false,
    },
    class_wizard: {
      preparation: "prepared",
      focusCategories: ["category_arcane_focus"],
      ritualCasting: true,
    },
    subclass_fighter_eldritch_knight: {
      preparation: "known",
      focusCategories: [],
      ritualCasting: false,
    },
    subclass_rogue_arcane_trickster: {
      preparation: "known",
      focusCategories: [],
      ritualCasting: false,
    },
  };

  it("states preparation, foci and ritual casting for every caster", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const declared = Object.fromEntries(
      [...pack.classes, ...pack.subclasses].flatMap((entry) =>
        entry.spellcasting
          ? [
              [
                entry.id,
                {
                  preparation: entry.spellcasting.preparation,
                  focusCategories: entry.spellcasting.focusCategories,
                  ritualCasting: entry.spellcasting.ritualCasting,
                },
              ],
            ]
          : [],
      ),
    );

    expect(declared).toEqual(EXPECTED);
  });

  it("declares every slot pool's level, and marks nothing else a slot", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const pools = [
      ...pack.resources,
      ...pack.traits.flatMap((trait) => trait.resources),
    ];

    // the one place an id is read: a data check that each slot pool
    // declares the level its id already says
    for (const pool of pools) {
      const declared = "spellSlot" in pool ? pool.spellSlot : undefined;
      const idLevel = /^spell_slots_(\d)$/.exec(pool.id)?.[1];

      if (idLevel) {
        expect(declared, pool.id).toEqual({ kind: "level", level: Number(idLevel) });
      } else if (pool.id === "pact_slots") {
        expect(declared, pool.id).toEqual({ kind: "pact" });
      } else {
        expect(declared, pool.id).toBeUndefined();
      }
    }
  });

  it("lets the component pouch stand in for material components", async () => {
    const pack = await assembleCoreRulePack(SHIPPED_PACK);
    const pouch = pack.equipment.find(
      (item) => item.id === "item_gear_component_pouch",
    );

    expect(pouch?.categoryTags).toEqual(["category_component_pouch"]);
  });
});
