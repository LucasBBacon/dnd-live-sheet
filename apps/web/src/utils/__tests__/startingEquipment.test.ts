import { describe, expect, it } from "vitest";
import { buildCategoryItemOptions } from "../startingEquipment";

describe("buildCategoryItemOptions", () => {
  it("returns items with matching category tags only", () => {
    const options = buildCategoryItemOptions(
      {
        itemsById: {
          item_weapon_dagger: {
            id: "item_weapon_dagger",
            name: "Dagger",
            type: "weapon",
            weight: 1,
            requiresAttunement: false,
            categoryTags: ["category_weapon_simple", "category_weapon_simple_melee"],
          },
          item_weapon_longsword: {
            id: "item_weapon_longsword",
            name: "Longsword",
            type: "weapon",
            weight: 3,
            requiresAttunement: false,
            categoryTags: ["category_weapon_martial", "category_weapon_martial_melee"],
          },
        },
      },
      "category_weapon_simple",
    );

    expect(options).toEqual([{ id: "item_weapon_dagger", name: "Dagger" }]);
  });

  it("returns empty when tags are missing for the requested category", () => {
    const options = buildCategoryItemOptions(
      {
        itemsById: {
          item_holy_symbol_amulet: {
            id: "item_holy_symbol_amulet",
            name: "Holy Symbol (Amulet)",
            type: "gear",
            weight: 1,
            requiresAttunement: false,
            categoryTags: [],
          },
        },
      },
      "category_holy_symbol",
    );

    expect(options).toEqual([]);
  });

  it("sorts matching options by item name", () => {
    const options = buildCategoryItemOptions(
      {
        itemsById: {
          item_focus_wand: {
            id: "item_focus_wand",
            name: "Wand",
            type: "gear",
            weight: 1,
            requiresAttunement: false,
            categoryTags: ["category_arcane_focus"],
          },
          item_focus_orb: {
            id: "item_focus_orb",
            name: "Orb",
            type: "gear",
            weight: 3,
            requiresAttunement: false,
            categoryTags: ["category_arcane_focus"],
          },
        },
      },
      "category_arcane_focus",
    );

    expect(options).toEqual([
      { id: "item_focus_orb", name: "Orb" },
      { id: "item_focus_wand", name: "Wand" },
    ]);
  });
});
