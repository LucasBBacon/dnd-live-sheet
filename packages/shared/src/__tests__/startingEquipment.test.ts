import { describe, expect, it } from "vitest";
import {
  getStartingEquipmentResolutionStatus,
  isResolvedStartingEquipmentGrant,
  matchesStartingEquipmentCategory,
} from "../startingEquipment.js";

describe("startingEquipment helpers", () => {
  it("marks category grants in given as unresolved", () => {
    const status = getStartingEquipmentResolutionStatus({
      given: [{ kind: "category", refId: "category_holy_symbol", quantity: 1 }],
      choices: [],
    });

    expect(status.isResolved).toBe(false);
    expect(status.hasUnresolvedChoices).toBe(false);
    expect(status.unresolvedGivenCategoryRefIds).toEqual([
      "category_holy_symbol",
    ]);
  });

  it("marks non-empty choices as unresolved", () => {
    const status = getStartingEquipmentResolutionStatus({
      given: [{ kind: "item", refId: "item_weapon_dagger", quantity: 1 }],
      choices: [
        {
          choose: 1,
          options: [
            {
              equipmentBundle: [
                { kind: "item", refId: "item_weapon_mace", quantity: 1 },
              ],
            },
          ],
        },
      ],
    });

    expect(status.isResolved).toBe(false);
    expect(status.hasUnresolvedChoices).toBe(true);
    expect(status.unresolvedGivenCategoryRefIds).toEqual([]);
  });

  it("accepts fully-resolved item and money grants", () => {
    const status = getStartingEquipmentResolutionStatus({
      given: [
        { kind: "item", refId: "item_weapon_dagger", quantity: 1 },
        { kind: "money", refId: "money_gp", quantity: 15 },
      ],
      choices: [],
    });

    expect(status.isResolved).toBe(true);
    expect(status.hasUnresolvedChoices).toBe(false);
    expect(status.unresolvedGivenCategoryRefIds).toEqual([]);
  });

  it("identifies resolved item grants", () => {
    expect(
      isResolvedStartingEquipmentGrant({
        kind: "item",
      }),
    ).toBe(true);

    expect(
      isResolvedStartingEquipmentGrant({
        kind: "category",
      }),
    ).toBe(false);
  });

  it("matches a simple weapon category candidate", () => {
    const isMatch = matchesStartingEquipmentCategory(
      {
        id: "item_weapon_dagger",
        name: "Dagger",
        categoryTags: [
          "category_weapon_simple",
          "category_weapon_simple_melee",
        ],
      },
      "category_weapon_simple",
    );

    expect(isMatch).toBe(true);
  });

  it("matches any category tag in a multi-category candidate", () => {
    const isMatch = matchesStartingEquipmentCategory(
      {
        id: "item_weapon_longsword",
        name: "Longsword",
        categoryTags: [
          "category_weapon_martial",
          "category_weapon_martial_melee",
        ],
      },
      "category_weapon_martial_melee",
    );

    expect(isMatch).toBe(true);
  });

  it("matches a holy symbol category candidate by explicit tag", () => {
    const isMatch = matchesStartingEquipmentCategory(
      {
        id: "item_holy_symbol_amulet",
        name: "Holy Symbol (Amulet)",
        categoryTags: ["category_holy_symbol"],
      },
      "category_holy_symbol",
    );

    expect(isMatch).toBe(true);
  });

  it("does not match when the candidate lacks the requested tag", () => {
    const isMatch = matchesStartingEquipmentCategory(
      {
        id: "item_holy_symbol_amulet",
        name: "Holy Symbol (Amulet)",
        categoryTags: [],
      },
      "category_holy_symbol",
    );

    expect(isMatch).toBe(false);
  });

  it("does not match unknown category tags", () => {
    const isMatch = matchesStartingEquipmentCategory(
      {
        id: "item_weapon_dagger",
        name: "Dagger",
        categoryTags: [
          "category_weapon_simple",
          "category_weapon_simple_melee",
        ],
      },
      "category_nonexistent",
    );

    expect(isMatch).toBe(false);
  });
});
